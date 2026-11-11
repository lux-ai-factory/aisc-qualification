"""Contract test for the headless qualification service."""
import os

from fastapi.testclient import TestClient

from app import app
from schemas import BuildResponse

TOKEN = "dev-token"
os.environ["BACKEND_TO_QUALIFICATION_TOKEN"] = TOKEN

client = TestClient(app)
AUTH = {"X-AISC-Service-Token": TOKEN}


def test_build_returns_a_card():
    resp = client.post("/api/build", json={
        "project_pid": "p1",
        "questionnaire_id": "q1",
        "questionnaire": {"name": "Annex IV"},
        "answers": {"q1": "yes"},
    }, headers=AUTH)
    assert resp.status_code == 200
    body = BuildResponse.model_validate(resp.json())
    assert body.jsonld.startswith("{")
    assert body.digest


def test_same_answers_same_digest():
    payload = {"project_pid": "p1", "questionnaire_id": "q1", "answers": {"a": 1}}
    first = client.post("/api/build", json=payload, headers=AUTH).json()["digest"]
    second = client.post("/api/build", json=payload, headers=AUTH).json()["digest"]
    assert first == second


def test_health_is_open():
    assert client.get("/health").status_code == 200


def test_door_closed_without_token():
    # A wrong or missing token is refused (401); the door fails closed.
    resp = client.post("/api/build", json={"answers": {}})
    assert resp.status_code == 401


def test_default_questionnaire_is_the_annex_iv_default():
    resp = client.get("/api/default-questionnaire", headers=AUTH)
    assert resp.status_code == 200
    body = resp.json()
    assert body["questionnaireId"] == "annex-iv-default"
    assert body["questionnaireName"] == "Annex IV default"
    assert len(body["questions"]) == 14
    assert "description" in body["blocks"]


def test_default_questionnaire_door_closed_without_token():
    resp = client.get("/api/default-questionnaire")
    assert resp.status_code == 401


def test_build_without_questionnaire_falls_back_to_default():
    resp = client.post("/api/build", json={
        "project_pid": "p1",
        "questionnaire_id": "",
        "questionnaire": {},
        "answers": {"q:annex-1:1a": "first release"},
    }, headers=AUTH)
    assert resp.status_code == 200
    body = BuildResponse.model_validate(resp.json())
    assert body.jsonld.startswith("{")
    assert body.digest


def test_map_answers_uses_reference_field_naming():
    from ontology import map_answers

    assert map_answers({"q:annex-1:1a": "x", "other": "y"}) == [
        {"toolId": "annex-1", "questionId": "1a", "answer": "x"},
        {"toolId": "custom", "questionId": "other", "answer": "y"},
    ]
    assert map_answers({}) == []


def test_build_prefers_the_ontology_card():
    import card

    real = {
        "view": {"summary": {"label": "Credit scorer"}},
        "turtle": "@prefix airo: <https://w3id.org/airo#> .",
        "jsonld": "{}",
        "problems": ["p1"],
        "digest": "abc",
    }
    called = {}

    def fake_build(system, questionnaire_id, answers):
        called["system"] = system
        return real

    original = card.ontology.build_card
    card.ontology.build_card = fake_build
    try:
        resp = client.post("/api/build", json={
            "project_pid": "p1",
            "questionnaire_id": "q1",
            "questionnaire": {"name": "Annex IV"},
            "answers": {"q:annex-1:1a": "x"},
            "system": {"name": "Credit scorer"},
        }, headers=AUTH)
    finally:
        card.ontology.build_card = original
    assert resp.status_code == 200
    body = resp.json()
    assert body["view"] == {"summary": {"label": "Credit scorer"}}
    assert body["problems"] == ["p1"]
    assert called["system"] == {"name": "Credit scorer"}


def test_build_falls_back_to_stub_without_ontology():
    import card

    original = card.ontology.build_card
    card.ontology.build_card = lambda *a: None
    try:
        resp = client.post("/api/build", json={
            "project_pid": "p1",
            "questionnaire_id": "q1",
            "questionnaire": {"name": "Annex IV"},
            "answers": {"a": 1},
        }, headers=AUTH)
    finally:
        card.ontology.build_card = original
    assert resp.status_code == 200
    assert resp.json()["view"]["answers_count"] == 1


class _FakeResp:
    def __init__(self, status, payload):
        self.status = status
        self._payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        import json

        return json.dumps(self._payload).encode("utf-8")


_BUILT = {"view": {"ok": True}, "jsonld": "{}", "turtle": "",
          "problems": [], "digest": "d"}


def _with_fake_ontology(handler):
    import urllib.request

    import ontology

    old_urlopen, old_base = urllib.request.urlopen, ontology.ONTOLOGY_SERVICE_URL
    urllib.request.urlopen = handler
    ontology.ONTOLOGY_SERVICE_URL = "http://onto"
    return old_urlopen, old_base


def _restore_fake_ontology(saved):
    import urllib.request

    import ontology

    old_urlopen, old_base = saved
    urllib.request.urlopen = old_urlopen
    ontology.ONTOLOGY_SERVICE_URL = old_base


def test_blocks_never_become_answers():
    from ontology import map_answers, split_blocks

    answers = {"q:annex-1:1a": "x",
               "__blocks": {"profile": {"description": "d"}}}
    prose, blocks = split_blocks(answers)
    assert prose == {"q:annex-1:1a": "x"}
    assert blocks == {"profile": {"description": "d"}}
    assert map_answers(answers) == [
        {"toolId": "annex-1", "questionId": "1a", "answer": "x"}
    ]
    assert split_blocks({}) == ({}, {})
    assert split_blocks({"a": 1}) == ({"a": 1}, {})


def test_map_risks_drops_incomplete_rows():
    from ontology import map_risks

    rows = map_risks([
        {"affected": "user", "risk": "r", "source": "s", "consequence": "c",
         "control": "ct", "vulnerability": "v",
         "impactAreas": ["Freedom", 3, ""]},
        {"affected": "user", "risk": "half"},
        "nope",
    ])
    assert len(rows) == 1
    assert rows[0]["position"] == 0
    assert rows[0]["vulnerability"] == "v"
    assert rows[0]["impactAreas"] == ["Freedom"]
    assert map_risks(None) == []


def test_build_forwards_blocks_to_ontology():
    import json

    import ontology

    seen = {}

    def fake_urlopen(req, timeout=None):
        seen.update(json.loads(req.data.decode("utf-8")))
        return _FakeResp(200, _BUILT)

    saved = _with_fake_ontology(fake_urlopen)
    try:
        out = ontology.build_card({"name": "S"}, "q1", {
            "q:annex-1:1a": "x",
            "__blocks": {
                "profile": {"targetUseCase": "loans"},
                "tags": {"targetSystem": ["CreditScore"], "sector": []},
                "risks": [{"affected": "user", "risk": "r", "source": "s",
                           "consequence": "c",
                           "control": "ct"}],
            },
        })
    finally:
        _restore_fake_ontology(saved)
    assert out is not None and out["digest"] == "d"
    qual = seen["qualification"]
    assert qual["targetUseCase"] == "loans"
    assert qual["targetSystemTags"] == ["CreditScore"]
    assert qual["sectorTags"] == []
    assert qual["risks"][0]["position"] == 0
    assert all(a["toolId"] != "__blocks" for a in qual["answers"])


def test_build_retries_without_risks_when_refused():
    import json

    import ontology

    payloads = []
    statuses = [422, 200]

    def fake_urlopen(req, timeout=None):
        payloads.append(json.loads(req.data.decode("utf-8")))
        return _FakeResp(statuses.pop(0), _BUILT)

    saved = _with_fake_ontology(fake_urlopen)
    try:
        out = ontology.build_card({"name": "S"}, "q1", {
            "q:annex-1:1a": "x",
            "__blocks": {
                "tags": {"targetSystem": ["CreditScore"]},
                "risks": [{"affected": "user", "risk": "r", "source": "s",
                           "consequence": "c",
                           "control": "ct"}],
            },
        })
    finally:
        _restore_fake_ontology(saved)
    assert out is not None
    assert len(payloads) == 2
    assert len(payloads[0]["qualification"]["risks"]) == 1
    assert payloads[1]["qualification"]["risks"] == []
    assert payloads[1]["qualification"]["targetSystemTags"] == ["CreditScore"]


def test_build_without_blocks_behaves_as_before():
    import json

    import ontology

    seen = {}

    def fake_urlopen(req, timeout=None):
        seen.update(json.loads(req.data.decode("utf-8")))
        return _FakeResp(200, _BUILT)

    saved = _with_fake_ontology(fake_urlopen)
    try:
        out = ontology.build_card({"name": "S"}, "q1", {"q:annex-1:1a": "x"})
    finally:
        _restore_fake_ontology(saved)
    assert out is not None
    qual = seen["qualification"]
    assert qual["risks"] == []
    assert qual["targetSystemTags"] == []
    assert qual["targetUseCase"] == ""


def test_vocabularies_door_closed_without_token():
    assert client.get("/api/vocabularies").status_code == 401


def test_vocabularies_empty_without_ontology():
    assert client.get("/api/vocabularies", headers=AUTH).json() == {}


def test_patch_is_forwarded_and_never_an_answer():
    import json

    import ontology

    assert ontology.split_patch({"a": 1}) == {}
    assert ontology.split_patch({"__patch": {"risk0": {"label": "R"}}}) == {
        "risk0": {"label": "R"}
    }
    assert ontology.split_patch({"__patch": "nope"}) == {}
    assert ontology.map_answers({"q:annex-1:1a": "x", "__patch": {}}) == [
        {"toolId": "annex-1", "questionId": "1a", "answer": "x"}
    ]

    seen = {}

    def fake_urlopen(req, timeout=None):
        seen.update(json.loads(req.data.decode("utf-8")))
        return _FakeResp(200, _BUILT)

    saved = _with_fake_ontology(fake_urlopen)
    try:
        out = ontology.build_card({"name": "S"}, "q1", {
            "q:annex-1:1a": "x",
            "__patch": {"purpose": {"label": "Loans"}},
        })
    finally:
        _restore_fake_ontology(saved)
    assert out is not None
    assert seen["patch"] == {"purpose": {"label": "Loans"}}
    assert all(a["toolId"] != "__patch" for a in seen["qualification"]["answers"])


def test_stub_counts_prose_answers_only():
    import card

    original = card.ontology.build_card
    card.ontology.build_card = lambda *a: None
    try:
        resp = client.post("/api/build", json={
            "project_pid": "p1",
            "questionnaire_id": "q1",
            "questionnaire": {"name": "Annex IV"},
            "answers": {
                "q:annex-1:1a": "x",
                "__blocks": {"profile": {"description": "d"}},
                "__patch": {"purpose": {"label": "L"}},
            },
        }, headers=AUTH)
    finally:
        card.ontology.build_card = original
    assert resp.status_code == 200
    assert resp.json()["view"]["answers_count"] == 1
