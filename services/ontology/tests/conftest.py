from pathlib import Path

import pytest
from rdflib import Graph

ROOT = Path(__file__).resolve().parents[1]
AIRO_TTL = ROOT / "airo" / "airo.ttl"
VAIR_TTL = ROOT / "airo" / "vair.ttl"


@pytest.fixture(scope="session")
def airo_graph() -> Graph:
    return Graph().parse(AIRO_TTL, format="turtle")


@pytest.fixture(scope="session")
def vair_graph() -> Graph:
    return Graph().parse(VAIR_TTL, format="turtle")


# Every endpoint of this service is behind service_token.py. The endpoint tests
# are about the endpoints, so their client carries a caller's token; the door is
# tested in test_service_token.py (DOOR_TEST = True), whose clients carry exactly
# what each test sends.

DOOR_TOKENS = {name: name.lower().replace("_", "-") + "-test-value" for name in ('QUALIFICATION_WEB_TO_ONTOLOGY_TOKEN', 'QUALIFICATION_AGENTS_TO_ONTOLOGY_TOKEN')}


@pytest.fixture(autouse=True)
def _a_callers_token(monkeypatch, request):
    for name, value in DOOR_TOKENS.items():
        monkeypatch.setenv(name, value)
    if getattr(request.module, "DOOR_TEST", False):
        return
    try:
        from starlette.testclient import TestClient
    except ImportError:  # a suite run without the web stack has no client to give it
        return
    # on the request, not the constructor: some suites make their client at import
    original = TestClient.request
    first = next(iter(DOOR_TOKENS.values()))

    def with_token(self, method, url, *args, headers=None, **kwargs):
        headers = {"X-AISC-Service-Token": first, **(headers or {})}
        return original(self, method, url, *args, headers=headers, **kwargs)

    monkeypatch.setattr(TestClient, "request", with_token)
