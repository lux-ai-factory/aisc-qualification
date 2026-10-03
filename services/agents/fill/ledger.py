"""The card agent's ledger events.

A refinement run is opened by the app (`card.ai_refinement_requested`, with a run id) before the agent
is asked. Everything the agent does in that run cites it: `agent.run_started`, one `ai.llm_call` per
model call, then `agent.run_finished` or `agent.run_failed`. The card itself is changed by the app,
in the PUT that publishes the draft, which records `card.augmented_by_ai` in its own transaction.

Events go to the platform's internal route with this service's own token (PLATFORM_LEDGER_AGENTS_TOKEN):
the agent never names a person, the platform takes the person from the run's start. Nothing is sent
while LEDGER_MODE is off, or for a run with no run id (an app that sends none). A post that
fails is retried, then logged; it never fails the run.
"""
from __future__ import annotations

import contextvars
import json
import logging
import os
import time
import uuid
from contextlib import contextmanager
from typing import Any, Callable, Iterator
from urllib import error, request

logger = logging.getLogger(__name__)

#: The run being served: {"pid", "qualification", "run_id", "request_id", "model"}.
RUN: contextvars.ContextVar[dict | None] = contextvars.ContextVar("ledger_run", default=None)
#: What the next model call is for: {"purpose", "property", "round"}.
PURPOSE: contextvars.ContextVar[dict | None] = contextvars.ContextVar("ledger_purpose", default=None)

RETRIES = (0.5, 1.0, 2.0)
TIMEOUT = 10.0


def on() -> bool:
    return os.environ.get("LEDGER_MODE", "off").strip().lower() in ("record", "enforce")


@contextmanager
def run(pid: str, qualification: str, run_id: str | None, request_id: str | None) -> Iterator[dict]:
    state = {"pid": pid, "qualification": qualification, "run_id": run_id, "request_id": request_id, "model": None}
    token = RUN.set(state)
    try:
        yield state
    finally:
        RUN.reset(token)


@contextmanager
def purpose(name: str, prop: str | None = None, round_no: int | None = None) -> Iterator[None]:
    token = PURPOSE.set({"purpose": name, "property": prop, "round": round_no})
    try:
        yield
    finally:
        PURPOSE.reset(token)


def headers() -> dict[str, str]:
    """What the app's PUT needs to record the agent's draft against the run."""
    state = RUN.get()
    if not state or not state.get("run_id"):
        return {}
    out = {"X-AISC-Run-Id": state["run_id"]}
    if state.get("request_id"):
        out["X-AISC-Request-Id"] = state["request_id"]
    if state.get("model"):
        out["X-AISC-Model"] = state["model"]
    return out


#: The model of a run before it is known (a run can fail before: the app down, no model chosen, a bad
#: key). The platform requires one on every AI event.
UNKNOWN_MODEL = "unknown"


def error_code(exc: BaseException) -> str:
    """What a failure was, from a closed list: never its text, which can hold a key in a URL or a card's
    personal data, and immudb keeps what it is given for ever."""
    name = type(exc).__name__
    if name == "ServiceError":
        return "service_unreachable"
    if name in ("ResolveError",):
        return "no_model"
    if name in ("JSONDecodeError", "ValidationError", "ValueError"):
        return "parse_error"
    if name in ("TimeoutError", "ReadTimeout", "ConnectTimeout"):
        return "timeout"
    return "error"


def emit(action: str, item_type: str, item_id: str | None, details: dict | None = None,
         send: Callable[[str, bytes, dict], int] | None = None, retries: tuple = RETRIES,
         timeout: float = TIMEOUT) -> bool:
    """Post one event of the current run; True when the platform took it (202)."""
    state = RUN.get()
    if not on() or not state or not state.get("run_id") or not state.get("request_id"):
        return False
    base = (os.environ.get("PLATFORM_URL") or "").rstrip("/")
    token = os.environ.get("PLATFORM_LEDGER_AGENTS_TOKEN") or ""
    if not base or not token:
        logger.warning("ledger: %s not sent (PLATFORM_URL or PLATFORM_LEDGER_AGENTS_TOKEN unset)", action)
        return False
    event: dict[str, Any] = {"event_id": str(uuid.uuid4()), "request_id": state["request_id"],
                             "run_id": state["run_id"], "action": action, "item_type": item_type,
                             "item_id": item_id, "details": details or {}}
    event["model"] = state.get("model") or UNKNOWN_MODEL
    url = f"{base}/internal/projects/{state['pid']}/ledger/events"
    body = json.dumps(event).encode("utf-8")
    hdrs = {"Content-Type": "application/json", "X-AISC-Service-Token": token}
    for wait in (*retries, None):                                     # the same event id each time
        try:
            status = (send or _send)(url, body, hdrs, timeout)
            if status in (202, 409):                                  # 409: an earlier try got through
                return True
            if status < 500:
                logger.error("ledger: the platform refused %s (%s)", action, status)
                return False
        except OSError as exc:
            logger.warning("ledger: %s not sent yet: %s", action, exc)
        if wait is None:
            break
        time.sleep(wait)
    logger.error("ledger: %s of run %s was not recorded", action, state["run_id"])
    return False


def _send(url: str, body: bytes, hdrs: dict, timeout: float = TIMEOUT) -> int:
    req = request.Request(url, data=body, method="POST", headers=hdrs)
    try:
        with request.urlopen(req, timeout=timeout) as res:
            return res.status
    except error.HTTPError as exc:
        return exc.code


def recording(complete: Callable[..., str]) -> Callable[..., str]:
    """The completer, each call timed and recorded as `ai.llm_call`."""
    def recorded(system: str, user: str, *args, **kwargs) -> str:
        started = time.monotonic()
        try:
            return complete(system, user, *args, **kwargs)
        finally:
            what = PURPOSE.get() or {}
            # One short try: a model call never waits on the ledger. The run's own start and end
            # events are retried.
            emit("ai.llm_call", "llm_call", str(uuid.uuid4()),
                 {"purpose": what.get("purpose") or "unknown", "property": what.get("property"),
                  "round": what.get("round"), "latency_ms": int((time.monotonic() - started) * 1000)},
                 retries=(), timeout=2.0)
    return recorded
