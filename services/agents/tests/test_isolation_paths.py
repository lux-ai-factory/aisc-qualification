"""The card agent under isolation (isolation-2026-09-25 01-specs.md I3.4, I18.1, I18.4).

Every card lives in its project's own database, so the agent is told the project in the
path: qualification-web calls ``POST /fill/{pid}/{qualificationId}`` and polls
``GET /fill/{pid}/{id}``; the agent reads and publishes the card at
``{APP_URL}/p/{pid}/api/qualifications/{id}/extracted`` with its own token. The project
whose model it uses is the ``projectId`` the app returns for that card (the database the
card was found in), never one a caller names.

Everything runs against fakes: the app is a FakeServer on 127.0.0.1, the model and the
ontology service are monkeypatched, as in test_project_llm.py. Written before the change:
these fail until WP Q1 moves the paths.
"""
from __future__ import annotations

import types
import uuid

import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient

import agent
import service
from fill import clients
from tests.fake_http import FakeServer

PID = str(uuid.uuid4())
OTHER = str(uuid.uuid4())
QID = "cardofprojecta000000000001"
AGENT_TO_WEB = "agent-to-web-" + uuid.uuid4().hex  # split so secrets.test.ts does not read it as a credential


@pytest.fixture
def app_server(monkeypatch):
    """qualification-web: answers the card's extracted document under its own project."""
    server = FakeServer()
    server.reply(f"/p/{PID}/api/qualifications/{QID}/extracted", {"id": QID, "projectId": PID})
    server.reply(f"/p/{PID}/api/qualifications/{QID}/extracted", {"ok": True}, method="PUT")
    monkeypatch.setattr(clients, "APP_URL", server.url)
    monkeypatch.setenv("QUALIFICATION_AGENTS_TO_WEB_TOKEN", AGENT_TO_WEB)
    yield server
    server.close()


@pytest.fixture
def no_model(monkeypatch):
    """No model and no ontology service: run_fill publishes one draft, config_for records its project."""
    projects: list = []

    def config_for(project, agent_name):
        projects.append(project)
        return {"provider": "fake"}

    monkeypatch.setattr(agent.baf_llm, "config_for", config_for)
    monkeypatch.setattr(agent.baf_llm, "build_llm", lambda config, agent_name=None: object())
    monkeypatch.setattr(agent.baf_llm, "completer", lambda llm: (lambda system, user: "{}"))
    monkeypatch.setattr(agent.clients, "vocabularies", lambda: {})

    def run_fill(qualification, terms, complete, publish, max_rounds):
        publish(qualification["id"], {"techniques": []})
        return types.SimpleNamespace(outcomes={}, rounds=1, calls=1, open_findings=0,
                                     payload={"flags": {}}, stop_reasons={})

    monkeypatch.setattr(agent, "run_fill", run_fill)
    return projects


@pytest.fixture
def client():
    service.RUNS.clear()
    return TestClient(service.app)


def test_i3_4_a_fill_is_started_at_fill_pid_id(client, app_server, no_model):
    res = client.post(f"/fill/{PID}/{QID}")
    assert res.status_code == 202, "I3.4: POST /fill/{pid}/{qualificationId} starts a run"


def test_i3_4_the_agent_reads_and_publishes_the_card_under_its_project(client, app_server, no_model):
    client.post(f"/fill/{PID}/{QID}")
    paths = [(r.method, r.path) for r in app_server.requests]
    assert ("GET", f"/p/{PID}/api/qualifications/{QID}/extracted") in paths, f"I3.4: read under /p/{{pid}}: {paths}"
    assert ("PUT", f"/p/{PID}/api/qualifications/{QID}/extracted") in paths, f"I3.4: publish under /p/{{pid}}: {paths}"
    assert not [p for _m, p in paths if p.startswith("/api/qualifications/")], "I3.3: the old paths are never called"


def test_i18_1_every_call_to_the_app_carries_the_agents_own_token(client, app_server, no_model):
    client.post(f"/fill/{PID}/{QID}")
    assert app_server.requests, "I3.4: the agent called the app"
    for seen in app_server.requests:
        assert seen.header("X-AISC-Service-Token") == AGENT_TO_WEB, f"I18.1: {seen.method} {seen.path}"


def test_i18_4_the_model_is_the_one_of_the_project_the_app_returned(client, app_server, no_model):
    client.post(f"/fill/{PID}/{QID}")
    assert no_model == [PID], "I18.4: config_for is called with the card's projectId from the app"


def test_i18_4_a_project_in_the_query_changes_nothing(client, app_server, no_model):
    client.post(f"/fill/{PID}/{QID}?project={OTHER}")
    assert no_model == [PID]
    assert not [r for r in app_server.requests if OTHER in r.path]


def test_i3_4_the_run_is_polled_at_fill_pid_id(client, app_server, no_model):
    client.post(f"/fill/{PID}/{QID}")
    res = client.get(f"/fill/{PID}/{QID}")
    assert res.status_code == 200
    assert res.json()["state"] == "done"


def test_i3_4_a_run_of_one_project_is_not_visible_under_another(client, app_server, no_model):
    client.post(f"/fill/{PID}/{QID}")
    assert client.get(f"/fill/{PID}/{QID}").status_code == 200, "I3.4: the run is there under its own project"
    assert client.get(f"/fill/{OTHER}/{QID}").status_code == 404, "I16.5: runs are keyed by project and card"


def test_i3_3_the_old_fill_path_without_a_project_is_gone(client, app_server, no_model):
    assert client.post(f"/fill/{QID}").status_code in (404, 405), "I3.3: POST /fill/{id} is gone"
    assert client.get(f"/fill/{QID}").status_code in (404, 405)
    assert not app_server.requests


@pytest.mark.parametrize("bad", ["microcredit-assist-score-mcas", "not-a-pid", PID + "x"])
def test_i1_8_a_project_that_is_not_a_pid_is_refused_before_a_run(client, app_server, no_model, bad):
    res = client.post(f"/fill/{bad}/{QID}")
    assert res.status_code in (404, 422), f"I1.8: {bad!r} is not a pid"
    assert not app_server.requests
    assert no_model == []
