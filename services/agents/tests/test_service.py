"""The HTTP entry point: what the app calls when a qualification is saved.

A run takes seconds to a minute and several LLM calls, so the request starts it
and returns. The state is readable afterwards, which is what lets the card show
what happened instead of the app pretending it knows.
"""
import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient

import service


@pytest.fixture
def client(monkeypatch):
    """A client whose runs are synchronous and fake, so the endpoint is what is
    under test rather than the model."""
    runs = []

    def fake_fill(qualification_id: str) -> dict:
        runs.append(qualification_id)
        return {"rounds": 4, "calls": 6, "flagged": 2}

    monkeypatch.setattr(service, "fill_one", fake_fill)
    service.RUNS.clear()
    client = TestClient(service.app)
    client.runs = runs  # type: ignore[attr-defined]
    return client


def test_it_says_it_is_alive(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_asking_for_a_fill_starts_one_and_returns_at_once(client):
    res = client.post("/fill/q1")
    assert res.status_code == 202
    assert res.json()["state"] in {"queued", "running", "done"}
    assert res.json()["qualification"] == "q1"


def test_the_run_actually_happens(client):
    client.post("/fill/q1")
    assert client.runs == ["q1"]


def test_the_state_is_readable_afterwards(client):
    client.post("/fill/q1")
    body = client.get("/fill/q1").json()
    assert body["state"] == "done"
    assert body["result"]["flagged"] == 2
    assert body["started"] and body["finished"]


def test_a_qualification_nobody_asked_about_is_not_invented(client):
    res = client.get("/fill/never-heard-of-it")
    assert res.status_code == 404


def test_a_failed_run_says_so_rather_than_vanishing(client, monkeypatch):
    def boom(qualification_id: str) -> dict:
        raise RuntimeError("the LLM service is down")

    monkeypatch.setattr(service, "fill_one", boom)
    client.post("/fill/q2")
    body = client.get("/fill/q2").json()
    assert body["state"] == "failed"
    assert "LLM service is down" in body["error"]


def test_a_run_already_in_flight_is_not_started_again(client):
    # Two saves in quick succession, or a retried request, must not put two runs
    # on the same qualification: they would race to publish the same document.
    service.RUNS["q1"] = {
        "qualification": "q1",
        "state": "running",
        "started": "now",
        "finished": None,
    }
    res = client.post("/fill/q1")
    assert res.status_code == 202
    assert res.json()["state"] == "running"
    assert client.runs == []


def test_a_finished_run_can_be_asked_for_again(client):
    # Re-running is a feature: the answers may have changed, or the draft was
    # poor. It is only the concurrent case that is refused.
    client.post("/fill/q1")
    client.post("/fill/q1")
    assert client.runs == ["q1", "q1"]
