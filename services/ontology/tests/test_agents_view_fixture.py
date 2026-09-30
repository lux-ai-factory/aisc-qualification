"""The card agent's tests read a real view of the MCAS example, and it is this builder's.

The agent reads the view /build returns; a fake of that shape once hid that the view has no
flat node list. The agent's fixture is therefore this builder's own output, and this test
fails the moment the two part. To regenerate it after an intended change to the view:
    WRITE_AGENTS_FIXTURE=1 .venv/bin/pytest -q tests/test_agents_view_fixture.py
"""
import json
import os
from pathlib import Path

from airo_min.build import build_graph
from airo_min.view import build_view

ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = ROOT / "examples"
FIXTURE = ROOT.parent / "agents" / "tests" / "fixtures" / "mcas.view.json"


def _mcas_view() -> dict:
    qualification = json.loads((EXAMPLES / "mcas.qualification.json").read_text(encoding="utf-8"))
    extracted = json.loads((EXAMPLES / "mcas.extracted.json").read_text(encoding="utf-8"))
    # through JSON, as the agent receives it
    return json.loads(json.dumps(build_view(build_graph(qualification, extracted))))


def test_the_agents_view_fixture_is_what_the_builder_makes_of_the_mcas_example():
    view = _mcas_view()
    if os.environ.get("WRITE_AGENTS_FIXTURE"):
        FIXTURE.parent.mkdir(parents=True, exist_ok=True)
        FIXTURE.write_text(json.dumps(view, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    assert FIXTURE.exists(), f"{FIXTURE} is missing: regenerate it (see this module's docstring)"
    assert json.loads(FIXTURE.read_text(encoding="utf-8")) == view
