"""HTTP entry point for the ontology filler.

The app calls this when a qualification is saved. A run makes several LLM calls
and takes seconds to a minute, so the request starts one and returns 202: a
server action that waits for it would hold the user's form submit open and fail
on the first slow model.

The state stays readable at GET /fill/{id}, which is how the card can say what
the run did rather than the app guessing. It lives in memory: a run is worth
reporting while it is fresh, and the durable record of it goes into the
qualification's own `extracted` document when the draft is published.
"""
from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import BackgroundTasks, FastAPI, HTTPException

from agent import fill_one

State = Literal["queued", "running", "done", "failed"]

app = FastAPI(title="Ontology filler", version="0.1.0")

#: qualification id -> what its latest run is doing. Guarded because BackgroundTasks
#: runs on a worker thread.
RUNS: dict[str, dict[str, Any]] = {}
_LOCK = threading.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def _run(qualification_id: str) -> None:
    """One run, with its outcome recorded either way."""
    with _LOCK:
        RUNS[qualification_id] |= {"state": "running"}
    try:
        result = fill_one(qualification_id)
    except Exception as exc:  # the app must be able to read why
        with _LOCK:
            RUNS[qualification_id] |= {
                "state": "failed",
                "error": str(exc),
                "finished": _now(),
            }
        return
    with _LOCK:
        RUNS[qualification_id] |= {
            "state": "done",
            "result": result,
            "finished": _now(),
        }


@app.post("/fill/{qualification_id}", status_code=202)
def start(qualification_id: str, background: BackgroundTasks) -> dict[str, Any]:
    """Start a run, unless one is already in flight for this qualification."""
    with _LOCK:
        current = RUNS.get(qualification_id)
        in_flight = current and current["state"] in {"queued", "running"}
        if not in_flight:
            RUNS[qualification_id] = {
                "qualification": qualification_id,
                "state": "queued",
                "started": _now(),
                "finished": None,
            }
    if not in_flight:
        background.add_task(_run, qualification_id)
    return RUNS[qualification_id]


@app.get("/fill/{qualification_id}")
def status(qualification_id: str) -> dict[str, Any]:
    run = RUNS.get(qualification_id)
    if run is None:
        raise HTTPException(status_code=404, detail="no run for that qualification")
    return run
