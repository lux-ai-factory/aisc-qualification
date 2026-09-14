"""The HTTP shapes this service speaks to the ontology service and the app.

The model is not reached over HTTP from here: BAF's own wrapper holds it, see
fill/llm.py and tests/test_llm.py.
"""
import json

import pytest

from fill import clients


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
    clients.publish("q1", {"techniques": []})
    assert sent[0]["url"].endswith("/api/qualifications/q1/extracted")
    assert sent[0]["method"] == "PUT"
