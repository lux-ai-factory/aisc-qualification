"""HTTP entry point for the ontology filler.

The app calls this when a qualification is saved. A run makes several LLM calls
and takes seconds to a minute, so the request starts one and returns 202: a
server action that waits for it would hold the user's form submit open and fail
on the first slow model.

Each card lives in its project's own database, so a run is addressed by the
project and the card: POST /fill/{pid}/{id} starts it, GET /fill/{pid}/{id} reads it.
The pid only says where the card is; the model's project is still read from the
card itself (agent.fill_one).

The state stays readable at GET /fill/{pid}/{id}, which is how the card can say what
the run did rather than the app guessing. It lives in memory: a run is worth
reporting while it is fresh, and the durable record of it goes into the
qualification's own `extracted` document when the draft is published.
"""
from __future__ import annotations

import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import BackgroundTasks, FastAPI, HTTPException

from agent import fill_one
from service_token import ServiceTokens

State = Literal["queued", "running", "done", "failed"]

app = FastAPI(title="Ontology filler", version="0.1.0")
# Only qualification-web calls this, with its own token: a run spends the
# qualification's project key, so nothing else on the network may start one.
app.add_middleware(ServiceTokens, names=("QUALIFICATION_WEB_TO_AGENTS_TOKEN",))

#: run_key(pid, qualification id) -> what its latest run is doing. Guarded because
#: BackgroundTasks runs on a worker thread.
RUNS: dict[str, dict[str, Any]] = {}
_LOCK = threading.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def run_key(pid: str, qualification_id: str) -> str:
    """Runs are keyed by project and card: a card id means nothing outside its project."""
    return f"{pid}/{qualification_id}"


def _run(pid: str, qualification_id: str) -> None:
    """One run, with its outcome recorded either way."""
    key = run_key(pid, qualification_id)
    with _LOCK:
        RUNS[key] |= {"state": "running"}
    try:
        result = fill_one(pid, qualification_id)
    except Exception as exc:  # the app must be able to read why
        with _LOCK:
            RUNS[key] |= {
                "state": "failed",
                "error": str(exc),
                "finished": _now(),
            }
        return
    with _LOCK:
        RUNS[key] |= {
            "state": "done",
            "result": result,
            "finished": _now(),
        }


@app.post("/fill/{pid}/{qualification_id}", status_code=202)
def start(pid: uuid.UUID, qualification_id: str, background: BackgroundTasks) -> dict[str, Any]:
    """Start a run, unless one is already in flight for this card.

    The pid (a uuid, else 422) says which project database the card is read from; a
    card of another project is simply not found there. The model's project is still
    read from the card, so whoever can reach this service cannot choose whose key a
    run spends."""
    project = str(pid)
    key = run_key(project, qualification_id)
    with _LOCK:
        current = RUNS.get(key)
        in_flight = current and current["state"] in {"queued", "running"}
        if not in_flight:
            RUNS[key] = {
                "project": project,
                "qualification": qualification_id,
                "state": "queued",
                "started": _now(),
                "finished": None,
            }
    if not in_flight:
        background.add_task(_run, project, qualification_id)
    return RUNS[key]


@app.get("/fill/{pid}/{qualification_id}")
def status(pid: uuid.UUID, qualification_id: str) -> dict[str, Any]:
    run = RUNS.get(run_key(str(pid), qualification_id))
    if run is None:
        raise HTTPException(status_code=404, detail="no run for that qualification")
    return run
