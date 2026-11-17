""" "Contract test for the qualification service (in-process AIRO build)."""

import json
import os

from fastapi.testclient import TestClient

from app import app
from schemas import BuildResponse

TOKEN = "dev-token"
os.environ["BACKEND_TO_QUALIFICATION_TOKEN"] = TOKEN

client = TestClient(app)
AUTH = {"X-AISC-Service-Token": TOKEN}


def test_build_returns_a_card():
    resp = client.post(
        "/api/build",
        json={
            "project_pid": "p1",
            "questionnaire_id": "q1",
            "questionnaire": {"name": "Annex IV"},
            "answers": {"q1": "yes"},
        },
        headers=AUTH,
    )
    assert resp.status_code == 200
    body = BuildResponse.model_validate(resp.json())
    # The jsonld is rdflib's JSON-LD serialisation (a list of named graphs).
    assert json.loads(body.jsonld) is not None
    assert body.turtle
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
    resp = client.post(
        "/api/build",
        json={
            "project_pid": "p1",
            "questionnaire_id": "",
            "questionnaire": {},
            "answers": {"q:annex-1:1a": "first release"},
        },
        headers=AUTH,
    )
    assert resp.status_code == 200
    body = BuildResponse.model_validate(resp.json())
    assert json.loads(body.jsonld) is not None
    assert body.digest


def test_map_answers_uses_reference_field_naming():
    from ontology import map_answers

    assert map_answers({"q:annex-1:1a": "x", "other": "y"}) == [
        {"toolId": "annex-1", "questionId": "1a", "answer": "x"},
        {"toolId": "custom", "questionId": "other", "answer": "y"},
    ]
    assert map_answers({}) == []


def test_build_prefers_the_ontology_card(monkeypatch):
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
    monkeypatch.setattr(card.ontology, "build_card", fake_build)
    try:
        resp = client.post(
            "/api/build",
            json={
                "project_pid": "p1",
                "questionnaire_id": "q1",
                "questionnaire": {"name": "Annex IV"},
                "answers": {"q:annex-1:1a": "x"},
                "system": {"name": "Credit scorer"},
            },
            headers=AUTH,
        )
    finally:
        card.ontology.build_card = original
    assert resp.status_code == 200
    body = resp.json()
    assert body["view"] == {"summary": {"label": "Credit scorer"}}
    assert body["problems"] == ["p1"]
    assert called["system"] == {"name": "Credit scorer"}


def test_build_falls_back_to_stub_without_ontology(monkeypatch):
    import card

    original = card.ontology.build_card
    monkeypatch.setattr(card.ontology, "build_card", lambda *a: None)
    try:
        resp = client.post(
            "/api/build",
            json={
                "project_pid": "p1",
                "questionnaire_id": "q1",
                "questionnaire": {"name": "Annex IV"},
                "answers": {"a": 1},
            },
            headers=AUTH,
        )
    finally:
        card.ontology.build_card = original
    assert resp.status_code == 200
    assert resp.json()["view"]["answers_count"] == 1


class _FakeBuild:
    """Stands in for airo_min.build.build_graph in the service's build path."""


def test_blocks_never_become_answers():
    from ontology import map_answers, split_blocks

    answers = {"q:annex-1:1a": "x", "__blocks": {"profile": {"description": "d"}}}
    prose, blocks = split_blocks(answers)
    assert prose == {"q:annex-1:1a": "x"}
    assert blocks == {"profile": {"description": "d"}}
    assert map_answers(answers) == [{"toolId": "annex-1", "questionId": "1a", "answer": "x"}]
    assert split_blocks({}) == ({}, {})
    assert split_blocks({"a": 1}) == ({"a": 1}, {})


def test_map_risks_drops_incomplete_rows():
    from ontology import map_risks

    rows = map_risks(
        [
            {
                "affected": "user",
                "risk": "r",
                "source": "s",
                "consequence": "c",
                "control": "ct",
                "vulnerability": "v",
                "impactAreas": ["Freedom", 3, ""],
            },
            {"affected": "user", "risk": "half"},
            "nope",
        ]
    )
    assert len(rows) == 1
    assert rows[0]["position"] == 0
    assert rows[0]["vulnerability"] == "v"
    assert rows[0]["impactAreas"] == ["Freedom"]
    assert map_risks(None) == []


def test_build_maps_blocks_into_the_contract(monkeypatch):
    import ontology

    seen = {}

    def fake_build_once(qualification, patch):
        seen["qualification"] = qualification
        seen["patch"] = patch
        return {"view": {"ok": True}, "jsonld": "{}", "turtle": "", "problems": [], "digest": "d"}

    monkeypatch.setattr(ontology, "_build_once", fake_build_once)
    out = ontology.build_card(
        {"name": "S"},
        "q1",
        {
            "q:annex-1:1a": "x",
            "__blocks": {
                "profile": {"targetUseCase": "loans"},
                "tags": {"targetSystem": ["CreditScore"], "sector": []},
                "risks": [
                    {
                        "affected": "user",
                        "risk": "r",
                        "source": "s",
                        "consequence": "c",
                        "control": "ct",
                    }
                ],
            },
        },
    )
    assert out is not None and out["digest"] == "d"
    qual = seen["qualification"]
    assert qual["targetUseCase"] == "loans"
    assert qual["targetSystemTags"] == ["CreditScore"]
    assert qual["sectorTags"] == []
    assert qual["risks"][0]["position"] == 0
    assert all(a["toolId"] != "__blocks" for a in qual["answers"])


def test_build_retries_without_risks_when_refused(monkeypatch):
    """A build that fails with risks is retried without them, then answers-only."""
    import ontology

    attempts = []

    def fake_build_once(qualification, patch):
        attempts.append(qualification)
        if qualification["risks"]:
            return None  # refuse builds carrying risks
        return {"view": {"ok": True}, "jsonld": "{}", "turtle": "", "problems": [], "digest": "d"}

    monkeypatch.setattr(ontology, "_build_once", fake_build_once)
    out = ontology.build_card(
        {"name": "S"},
        "q1",
        {
            "q:annex-1:1a": "x",
            "__blocks": {
                "tags": {"targetSystem": ["CreditScore"]},
                "risks": [
                    {
                        "affected": "user",
                        "risk": "r",
                        "source": "s",
                        "consequence": "c",
                        "control": "ct",
                    }
                ],
            },
        },
    )
    assert out is not None
    # Attempt 1 carried the risks (refused by the stub), attempt 2 did not.
    assert len(attempts) == 2
    assert [bool(q["risks"]) for q in attempts] == [True, False]
    assert attempts[0]["targetSystemTags"] == ["CreditScore"]
    assert attempts[1]["targetSystemTags"] == ["CreditScore"]


def test_build_without_blocks_behaves_as_before(monkeypatch):
    import ontology

    seen = {}

    def fake_build_once(qualification, patch):
        seen["qualification"] = qualification
        return {"view": {"ok": True}, "jsonld": "{}", "turtle": "", "problems": [], "digest": "d"}

    monkeypatch.setattr(ontology, "_build_once", fake_build_once)
    out = ontology.build_card({"name": "S"}, "q1", {"q:annex-1:1a": "x"})
    assert out is not None
    qual = seen["qualification"]
    assert qual["risks"] == []
    assert qual["targetSystemTags"] == []
    assert qual["targetUseCase"] == ""
    assert qual["answers"] == [{"toolId": "annex-1", "questionId": "1a", "answer": "x"}]


def test_vocabularies_door_closed_without_token():
    assert client.get("/api/vocabularies").status_code == 401


def test_vocabularies_serve_the_vendored_vair_terms():
    resp = client.get("/api/vocabularies", headers=AUTH)
    assert resp.status_code == 200
    body = resp.json()
    # The vendored vair.ttl yields a term list per AIRO class; never empty.
    assert body
    assert all(isinstance(v, list) for v in body.values())


def test_patch_is_forwarded_and_never_an_answer(monkeypatch):
    import ontology

    assert ontology.split_patch({"a": 1}) == {}
    assert ontology.split_patch({"__patch": {"risk0": {"label": "R"}}}) == {"risk0": {"label": "R"}}
    assert ontology.split_patch({"__patch": "nope"}) == {}
    assert ontology.map_answers({"q:annex-1:1a": "x", "__patch": {}}) == [
        {"toolId": "annex-1", "questionId": "1a", "answer": "x"}
    ]

    seen = {}

    def fake_build_once(qualification, patch):
        seen["patch"] = patch
        seen["answers"] = qualification["answers"]
        return {"view": {"ok": True}, "jsonld": "{}", "turtle": "", "problems": [], "digest": "d"}

    monkeypatch.setattr(ontology, "_build_once", fake_build_once)
    out = ontology.build_card(
        {"name": "S"},
        "q1",
        {
            "q:annex-1:1a": "x",
            "__patch": {"purpose": {"label": "Loans"}},
        },
    )
    assert out is not None
    assert seen["patch"] == {"purpose": {"label": "Loans"}}
    assert all(a["toolId"] != "__patch" for a in seen["answers"])


def test_stub_counts_prose_answers_only(monkeypatch):
    import card

    original = card.ontology.build_card
    monkeypatch.setattr(card.ontology, "build_card", lambda *a: None)
    try:
        resp = client.post(
            "/api/build",
            json={
                "project_pid": "p1",
                "questionnaire_id": "q1",
                "questionnaire": {"name": "Annex IV"},
                "answers": {
                    "q:annex-1:1a": "x",
                    "__blocks": {"profile": {"description": "d"}},
                    "__patch": {"purpose": {"label": "L"}},
                },
            },
            headers=AUTH,
        )
    finally:
        card.ontology.build_card = original
    assert resp.status_code == 200
    assert resp.json()["view"]["answers_count"] == 1


def test_configured_build_failure_is_not_a_stub(monkeypatch):
    """When the in-process builder refuses every retry, the API answers 502 —
    never a successful stub card."""
    import ontology

    monkeypatch.setattr(ontology, "_build_once", lambda *a: None)
    with TestClient(app) as client:
        response = client.post(
            "/api/build",
            json={"project_pid": "p", "questionnaire_id": "q", "questionnaire": {}, "answers": {}},
            headers={"X-AISC-Service-Token": TOKEN},
        )
    assert response.status_code == 502
