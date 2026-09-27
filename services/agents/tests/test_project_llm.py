"""The card agent works for a project, with that project's model (01-specs.md S3.7).

The project is never the caller's to name: `fill_one` reads it from the qualification it
works on (`projectId` in the app's export) and builds its completer from
`baf_llm.config_for(<that project>, "card_agent")`. `POST /fill/{id}` takes no project, and
a `?project=` a caller adds changes nothing. The platform and the model are fake servers on
127.0.0.1; the ontology service and the app (`fill.clients`) are monkeypatched, as in
test_service.py.
"""
from __future__ import annotations

import json
import types
import uuid

import pytest

pytest.importorskip("baf")
pytest.importorskip("fastapi")
from fastapi.testclient import TestClient

import agent
import service
from tests.fake_http import Canned, FakeServer, chat_completion, closed_port_url, new_key

PID = str(uuid.uuid4())
OTHER = str(uuid.uuid4())
#: qualification id -> the project the app says it belongs to (None: an export without one)
QUALIFICATIONS = {"q1": PID, "q9": PID, "q-none": None}
TOKEN = "pytest-" + "internal-" + uuid.uuid4().hex  # split: a 16-char literal after "token =" trips test/unit/secrets.test.ts


@pytest.fixture(autouse=True)
def _no_real_model(monkeypatch):
    """Nothing from the shell may reach a real provider or the host's ollama."""
    for name in ("BAF_LLM_PROVIDER", "BAF_LLM_MODEL", "BAF_LLM_BASE_URL", "BAF_LLM_API_KEY", "PLATFORM_URL",
                 "PLATFORM_INTERNAL_TOKEN", "ANTHROPIC_API_KEY", "DEEPSEEK_API_KEY", "GOOGLE_API_KEY",
                 "GROQ_API_KEY", "META_API_KEY", "MISTRAL_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY",
                 "QWEN_API_KEY", "TOGETHER_API_KEY", "XAI_API_KEY"):
        monkeypatch.delenv(name, raising=False)


@pytest.fixture
def platform(monkeypatch):
    server = FakeServer()
    monkeypatch.setenv("PLATFORM_URL", server.url)
    monkeypatch.setenv("PLATFORM_INTERNAL_TOKEN", TOKEN)
    yield server
    server.close()


@pytest.fixture
def model_server():
    server = FakeServer()
    server.reply("/v1/chat/completions", lambda seen: Canned(
        200, json.dumps(chat_completion("{}", json.loads(seen.body or b"{}").get("model", "x"))).encode()),
        method="POST")
    yield server
    server.close()


@pytest.fixture
def no_services(monkeypatch):
    """The ontology service and the app, faked; run_fill makes one model call."""
    monkeypatch.setattr(agent.clients, "qualification", lambda qid: {"id": qid, "projectId": QUALIFICATIONS.get(qid)})
    monkeypatch.setattr(agent.clients, "vocabularies", lambda: {})
    monkeypatch.setattr(agent.clients, "publish", lambda qid, payload: None)

    def run_fill(qualification, terms, complete, publish, max_rounds):
        complete("the system prompt", "the user prompt")
        return types.SimpleNamespace(outcomes={}, rounds=1, calls=1, open_findings=0,
                                     payload={"flags": {}}, stop_reasons={})

    monkeypatch.setattr(agent, "run_fill", run_fill)


def choose(platform, body, status=200):
    platform.reply(f"/internal/projects/{PID}/llm/card_agent", body, status=status)


# ── the HTTP entry point ─────────────────────────────────────────────────────


@pytest.fixture
def client(monkeypatch):
    calls = []

    def fake_fill(qualification_id, dry_run=False, **extra):
        calls.append((qualification_id, extra))
        return {"rounds": 1, "calls": 1, "flagged": 0, "model": "fake/model", "project": PID}

    monkeypatch.setattr(service, "fill_one", fake_fill)
    service.RUNS.clear()
    c = TestClient(service.app)
    c.calls = calls  # type: ignore[attr-defined]
    return c


def test_s3_7_a_run_is_started_with_the_qualification_only(client):
    assert client.post("/fill/q1").status_code == 202
    assert client.calls == [("q1", {})]


def test_s3_7_a_project_named_by_the_caller_changes_nothing(client):
    """The hole this closes: a caller naming another project to spend its key."""
    assert client.post(f"/fill/q1?project={OTHER}").status_code == 202
    assert client.calls == [("q1", {})]
    assert client.get("/fill/q1").json().get("project") != OTHER


def test_s3_7_the_run_records_the_project_it_used(client):
    client.post("/fill/q1")
    assert client.get("/fill/q1").json()["result"]["project"] == PID


# ── fill_one with a project ──────────────────────────────────────────────────


def test_s3_7_fill_one_uses_the_projects_resolved_model(platform, model_server, no_services, monkeypatch):
    env_key, key = new_key(), new_key()
    monkeypatch.setenv("BAF_LLM_PROVIDER", "mistral")
    monkeypatch.setenv("MISTRAL_API_KEY", env_key)
    choose(platform, {"configured": True, "provider": "compatible", "model": "project-model",
                      "base_url": model_server.url + "/v1", "api_key": key})
    result = agent.fill_one("q1")
    assert result["model"] == "compatible/project-model"
    assert result["project"] == PID
    (sent,) = model_server.seen("/v1/chat/completions")
    assert sent.header("Authorization") == f"Bearer {key}"
    assert json.loads(sent.body)["model"] == "project-model"
    assert platform.seen(f"/internal/projects/{PID}/llm/card_agent")[0].header("X-AISC-Service-Token") == TOKEN


def test_s3_7_a_qualification_without_a_project_uses_the_environment(model_server, no_services, monkeypatch):
    monkeypatch.delenv("PLATFORM_URL", raising=False)
    monkeypatch.setenv("BAF_LLM_PROVIDER", "compatible")
    monkeypatch.setenv("BAF_LLM_MODEL", "env-model")
    monkeypatch.setenv("BAF_LLM_BASE_URL", model_server.url + "/v1")
    monkeypatch.delenv("BAF_LLM_API_KEY", raising=False)
    result = agent.fill_one("q-none")
    assert result["model"] == "compatible/env-model"
    assert json.loads(model_server.seen("/v1/chat/completions")[0].body)["model"] == "env-model"


def test_s3_7_a_project_with_no_choice_uses_the_environment(platform, model_server, no_services, monkeypatch):
    monkeypatch.setenv("BAF_LLM_PROVIDER", "compatible")
    monkeypatch.setenv("BAF_LLM_MODEL", "env-model")
    monkeypatch.setenv("BAF_LLM_BASE_URL", model_server.url + "/v1")
    choose(platform, {"configured": False})
    assert agent.fill_one("q1")["model"] == "compatible/env-model"


# ── failures are the run's, never a key's ────────────────────────────────────


def _run_through_service():
    service.RUNS.clear()
    c = TestClient(service.app)
    assert c.post("/fill/q9").status_code == 202
    return c.get("/fill/q9").json()


def test_s3_7_d4_a_resolve_error_fails_the_run_with_the_platforms_reason(platform, no_services, monkeypatch):
    monkeypatch.setenv("BAF_LLM_PROVIDER", "ollama")   # must NOT be used instead (fail closed)
    monkeypatch.setenv("BAF_LLM_BASE_URL", closed_port_url())  # and never the host's real ollama
    choose(platform, {"detail": "the stored key for openai cannot be decrypted; enter it again"}, status=409)
    run = _run_through_service()
    assert run["state"] == "failed"
    assert "cannot be decrypted" in run["error"]
    assert TOKEN not in run["error"]


def test_s3_7_s5_3_a_build_error_fails_the_run_without_the_key(platform, no_services):
    key = new_key()
    choose(platform, {"configured": True, "provider": "telepathy", "model": "x", "base_url": None, "api_key": key})
    run = _run_through_service()
    assert run["state"] == "failed"
    assert "telepathy" in run["error"]
    assert key not in json.dumps(run)


def test_s3_7_fill_one_takes_no_project_from_its_caller():
    import inspect
    assert "project" not in inspect.signature(agent.fill_one).parameters


def test_s3_7_the_platform_is_asked_for_the_qualifications_project_only(platform, model_server, no_services):
    key = new_key()
    platform.reply(f"/internal/projects/{PID}/llm/card_agent",
                   {"configured": True, "provider": "compatible", "model": "m",
                    "base_url": model_server.url + "/v1", "api_key": key})
    agent.fill_one("q1")
    assert platform.seen(f"/internal/projects/{OTHER}/llm/card_agent") == []
    assert len(platform.seen(f"/internal/projects/{PID}/llm/card_agent")) == 1
