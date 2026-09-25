"""The HTTP shapes this service speaks to the ontology service and the app.

The model is not reached over HTTP from here: BAF's own wrapper holds it, see
fill/llm.py and tests/test_llm.py.
"""
import json
import uuid

import pytest

from fill import clients

#: the card's project: its database is where the app finds it (isolation Q1)
PID = str(uuid.uuid4())


class FakeResponse:
    def __init__(self, payload):
        self._payload = json.dumps(payload).encode()

    def read(self):
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


@pytest.fixture
def sent(monkeypatch):
    """Capture what the client puts on the wire, and answer it."""
    calls = []

    def fake_urlopen(req, timeout=None):
        body = req.data.decode() if req.data else ""
        calls.append(
            {
                "url": req.full_url,
                "method": req.get_method(),
                "json": json.loads(body) if body else None,
            }
        )
        return FakeResponse({"ok": True})

    monkeypatch.setattr(clients.request, "urlopen", fake_urlopen)
    return calls


def test_publishing_puts_to_the_app(sent):
    clients.publish(PID, "q1", {"techniques": []})
    assert sent[0]["url"].endswith(f"/p/{PID}/api/qualifications/q1/extracted")
    assert sent[0]["method"] == "PUT"


# ── API auth WP2 (2026-09-25): a token per service it calls ──────────────────
# The app accepts the agent's own token on /p/{pid}/api/qualifications/{id}/extracted,
# and the ontology service accepts the agent's own token (not the app's). Each
# call carries the token of the service it goes to and never the other one.

WEB = "QUALIFICATION_AGENTS_TO_WEB_TOKEN"
ONTOLOGY = "QUALIFICATION_AGENTS_TO_ONTOLOGY_TOKEN"


@pytest.fixture
def tokens(monkeypatch):
    values = {WEB: "agents-to-web-test-value", ONTOLOGY: "agents-to-ontology-test-value"}
    for name, value in values.items():
        monkeypatch.setenv(name, value)
    return values


@pytest.fixture
def headers_sent(monkeypatch):
    calls = []

    def fake_urlopen(req, timeout=None):
        calls.append((req.full_url, {k.lower(): v for k, v in req.header_items()}))
        return FakeResponse({"ok": True})

    monkeypatch.setattr(clients.request, "urlopen", fake_urlopen)
    return calls


def test_reading_and_publishing_carry_the_apps_token(tokens, headers_sent):
    clients.qualification(PID, "q1")
    clients.publish(PID, "q1", {"techniques": []})
    for url, headers in headers_sent:
        assert url.endswith(f"/p/{PID}/api/qualifications/q1/extracted")
        assert headers["x-aisc-service-token"] == tokens[WEB]


def test_the_ontology_calls_carry_the_ontology_services_token(tokens, headers_sent):
    clients.vocabularies()
    clients.build({"systemName": "x"}, {})
    assert [u.rsplit("/", 1)[1] for u, _ in headers_sent] == ["vocabularies", "build"]
    for _, headers in headers_sent:
        assert headers["x-aisc-service-token"] == tokens[ONTOLOGY]


def test_without_a_token_nothing_is_sent_in_its_place(monkeypatch, headers_sent):
    monkeypatch.delenv(WEB, raising=False)
    monkeypatch.delenv(ONTOLOGY, raising=False)
    clients.qualification(PID, "q1")
    clients.vocabularies()
    for _, headers in headers_sent:
        assert "x-aisc-service-token" not in headers
