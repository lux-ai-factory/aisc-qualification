"""The drill's agent: the real service, with a fill that records its start and one model call, then
works for a long time (the drill kills it there). Started by test_drill_agent_killed.py."""
import os
import sys
import time

import uvicorn

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import service  # noqa: E402
from fill import ledger  # noqa: E402


def slow_fill(pid, qualification_id):
    state = ledger.RUN.get()
    state["model"] = "openai/gpt-4o-mini"
    ledger.emit("agent.run_started", "agent_run", state["run_id"], {"model": state["model"]})
    with ledger.purpose("draft", "hasPurpose"):
        ledger.recording(lambda s, u: "{}")("s", "u")
    time.sleep(float(os.environ.get("DRILL_WORK_SECONDS", "60")))
    return {"rounds": 1, "calls": 1}


service.fill_one = slow_fill
uvicorn.run(service.app, host="127.0.0.1", port=int(sys.argv[1]), log_level="warning")
