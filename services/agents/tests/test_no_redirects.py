"""The service token goes only where the request was sent.

The calls to the ontology service, the app and the platform's ledger carry an
X-AISC-Service-Token. A redirect to another host would hand it to that host, and a
proxy named in the environment would see it in transit, so neither is followed:
the same opener as fill/baf_llm.py, no proxy and no redirect.

No network: every server is a fake on this machine.
"""
from __future__ import annotations

import json
import uuid
from urllib import request

import pytest

pytest.importorskip("baf")

from fill import clients, ledger  # noqa: E402
from tests.fake_http import Canned, FakeServer  # noqa: E402

PID = str(uuid.uuid4())
TOKEN = "pytest-" + "agents-" + uuid.uuid4().hex


@pytest.fixture
def servers():
    made = []

    def make():
        server = FakeServer()
        made.append(server)
        return server

    yield make
    for server in made:
        server.close()


@pytest.fixture(autouse=True)
def _tokens(monkeypatch):
    monkeypatch.setenv(clients.APP_TOKEN_VAR, TOKEN)
    monkeypatch.setenv(clients.ONTOLOGY_TOKEN_VAR, TOKEN)
    # a process that has not opened anything yet: urllib's shared opener reads the proxy then
    monkeypatch.setattr(request, "_opener", None)


def _redirecting(origin: FakeServer, status: int, elsewhere: FakeServer, path: str, method: str = "GET"):
    # another host name, not just another port: 'localhost' instead of 127.0.0.1
    target = elsewhere.url.replace("127.0.0.1", "localhost") + path
    origin.reply(path, lambda seen: Canned(status, b"", {"Location": target}), method=method)
    elsewhere.reply(path, {"stolen": True}, method=method)


@pytest.mark.parametrize("status", [302, 307])
def test_the_ontology_service_redirecting_elsewhere_is_an_error_and_the_token_stays(
        servers, monkeypatch, status):
    origin, elsewhere = servers(), servers()
    _redirecting(origin, status, elsewhere, "/vocabularies")
    monkeypatch.setattr(clients, "ONTOLOGY_URL", origin.url)
    with pytest.raises(clients.ServiceError):
        clients.vocabularies()
    assert elsewhere.seen() == []


@pytest.mark.parametrize("status", [302, 307])
def test_the_app_redirecting_a_published_draft_elsewhere_is_an_error_and_the_token_stays(
        servers, monkeypatch, status):
    origin, elsewhere = servers(), servers()
    path = f"/p/{PID}/api/qualifications/q1/extracted"
    _redirecting(origin, status, elsewhere, path, method="PUT")
    _redirecting(origin, status, elsewhere, path)
    monkeypatch.setattr(clients, "APP_URL", origin.url)
    with pytest.raises(clients.ServiceError):
        clients.qualification(PID, "q1")
    with pytest.raises(clients.ServiceError):
        clients.publish(PID, "q1", {"techniques": []})
    assert elsewhere.seen() == []


@pytest.mark.parametrize("status", [302, 307])
def test_the_ledger_redirecting_elsewhere_is_not_followed(servers, status):
    origin, elsewhere = servers(), servers()
    _redirecting(origin, status, elsewhere, "/internal/ledger/events", method="POST")
    code = ledger._send(origin.url + "/internal/ledger/events", json.dumps({}).encode(),
                        {"Content-Type": "application/json", "X-AISC-Service-Token": TOKEN})
    assert code == status
    assert elsewhere.seen() == []


def test_a_proxy_in_the_environment_is_ignored(servers, monkeypatch):
    target, proxy = servers(), servers()
    for path, method in (("/vocabularies", "GET"), ("/internal/ledger/events", "POST")):
        target.reply(path, {}, method=method)
        proxy.reply(path, {}, method=method)
    for name in ("HTTP_PROXY", "http_proxy"):
        monkeypatch.setenv(name, proxy.url)
    for name in ("NO_PROXY", "no_proxy"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(clients, "ONTOLOGY_URL", target.url)

    clients.vocabularies()
    ledger._send(target.url + "/internal/ledger/events", b"{}",
                 {"Content-Type": "application/json", "X-AISC-Service-Token": TOKEN})

    assert proxy.seen() == []
    assert [r.path for r in target.seen()] == ["/vocabularies", "/internal/ledger/events"]
