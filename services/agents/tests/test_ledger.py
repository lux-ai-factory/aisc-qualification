"""Q4: an agent run is in the ledger (spec 4.4). The app opens the run (card.ai_refinement_requested,
with a run id) and hands the agent the run id and the person's request id; every event of the run
cites both, the model is on each, the person never is. A post that fails is retried, then logged:
it never fails the run."""
import json
import uuid

import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient

import service
from fill import ledger

PID = str(uuid.uuid4())
RUN_ID = str(uuid.uuid4())
REQUEST_ID = str(uuid.uuid4())


@pytest.fixture
def sent(monkeypatch):
    out = []

    def fake_send(url, body, hdrs):
        out.append({"url": url, "event": json.loads(body), "headers": hdrs})
        return 202
    monkeypatch.setattr(ledger, "_send", fake_send)
    monkeypatch.setattr(ledger.time, "sleep", lambda _s: None)
    monkeypatch.setenv("LEDGER_MODE", "record")
    monkeypatch.setenv("PLATFORM_URL", "http://platform:8000")
    monkeypatch.setenv("PLATFORM_LEDGER_AGENTS_TOKEN", "agents-token-0123456789")
    return out


@pytest.fixture
def client(monkeypatch):
    def fake_fill(pid, qualification_id):
        state = ledger.RUN.get()
        state["model"] = "openai/gpt-4o-mini"
        ledger.emit("agent.run_started", "agent_run", state["run_id"], {"model": state["model"]})
        complete = ledger.recording(lambda system, user: "{}")
        with ledger.purpose("draft", "hasPurpose"):
            complete("s", "u")
        return {"rounds": 2, "calls": 1, "flagged": 0}
    monkeypatch.setattr(service, "fill_one", fake_fill)
    service.RUNS.clear()
    return TestClient(service.app)                                    # conftest gives it the app's token


def start(client, **headers):
    return client.post(f"/fill/{PID}/q1", headers=headers)


def test_a_run_records_its_start_each_model_call_and_its_end(client, sent):
    assert start(client, **{"X-AISC-Run-Id": RUN_ID, "X-AISC-Request-Id": REQUEST_ID}).status_code == 202
    actions = [s["event"]["action"] for s in sent]
    assert actions == ["agent.run_started", "ai.llm_call", "agent.run_finished"]
    for s in sent:
        e = s["event"]
        assert (e["run_id"], e["request_id"], e["model"]) == (RUN_ID, REQUEST_ID, "openai/gpt-4o-mini")
        assert s["url"] == f"http://platform:8000/internal/projects/{PID}/ledger/events"
        assert s["headers"]["X-AISC-Service-Token"] == "agents-token-0123456789"
        assert not {"actor_ref", "on_behalf_of_ref", "actor_kind"} & set(e)       # never a person
    call = sent[1]["event"]["details"]
    assert call["purpose"] == "draft" and call["property"] == "hasPurpose" and call["latency_ms"] >= 0
    assert service.RUNS[f"{PID}/q1"]["run_id"] == RUN_ID


def test_a_failed_run_records_why(client, sent, monkeypatch):
    def boom(pid, qid):
        raise RuntimeError("the model is down")
    monkeypatch.setattr(service, "fill_one", boom)
    start(client, **{"X-AISC-Run-Id": RUN_ID, "X-AISC-Request-Id": REQUEST_ID})
    assert [(s["event"]["action"], s["event"]["details"]) for s in sent] == [
        ("agent.run_failed", {"error": "the model is down"})]


def test_without_a_run_id_or_with_the_ledger_off_nothing_is_sent(client, sent, monkeypatch):
    start(client)                                                     # an app from before the ledger
    assert sent == []
    monkeypatch.setenv("LEDGER_MODE", "off")
    service.RUNS.clear()
    start(client, **{"X-AISC-Run-Id": RUN_ID, "X-AISC-Request-Id": REQUEST_ID})
    assert sent == []


def test_an_id_that_is_not_a_uuid_is_never_put_in_an_event(client, sent):
    start(client, **{"X-AISC-Run-Id": "x; DROP", "X-AISC-Request-Id": REQUEST_ID})
    assert sent == [] and service.RUNS[f"{PID}/q1"]["run_id"] is None


def test_a_post_that_fails_is_retried_with_the_same_event_then_logged(monkeypatch, sent):
    answers = iter([503, OSError("refused"), 202])
    seen = []

    def flaky(url, body, hdrs):
        seen.append(json.loads(body)["event_id"])
        a = next(answers)
        if isinstance(a, Exception):
            raise a
        return a
    monkeypatch.setattr(ledger, "_send", flaky)
    with ledger.run(PID, "q1", RUN_ID, REQUEST_ID):
        assert ledger.emit("agent.run_finished", "agent_run", RUN_ID, {}) is True
    assert len(seen) == 3 and len(set(seen)) == 1

    monkeypatch.setattr(ledger, "_send", lambda *a: 503)
    with ledger.run(PID, "q1", RUN_ID, REQUEST_ID):
        assert ledger.emit("agent.run_finished", "agent_run", RUN_ID, {}) is False   # never raises


def test_the_published_draft_carries_the_run(monkeypatch, sent):
    from fill import clients

    got = {}

    def fake_post(url, payload, token, method="POST", extra=None):
        got.update(extra or {})
        return {"ok": True}
    monkeypatch.setattr(clients, "_post", fake_post)
    with ledger.run(PID, "q1", RUN_ID, REQUEST_ID) as state:
        state["model"] = "openai/gpt-4o-mini"
        clients.publish(PID, "q1", {"components": []})
    assert got == {"X-AISC-Run-Id": RUN_ID, "X-AISC-Request-Id": REQUEST_ID, "X-AISC-Model": "openai/gpt-4o-mini"}
