"""The sidecar's HTTP contract, as the Next.js app consumes it."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import app

EXAMPLES = Path(__file__).resolve().parents[1] / "examples"


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.fixture(scope="module")
def payload():
    return {
        "qualification": json.loads(
            (EXAMPLES / "mcas.qualification.json").read_text(encoding="utf-8")
        ),
        "extracted": json.loads(
            (EXAMPLES / "mcas.extracted.json").read_text(encoding="utf-8")
        ),
    }


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_build_returns_the_view_and_both_serialisations(client, payload):
    r = client.post("/build", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"view", "turtle", "jsonld", "problems", "digest"}
    assert body["problems"] == []
    assert body["view"]["counts"]["risks"] == 5
    assert len(body["view"]["rows"]) == 10
    assert body["turtle"].startswith("@prefix")
    assert "@graph" in body["jsonld"] or "@id" in body["jsonld"]


def test_build_applies_a_patch_and_marks_the_node_reviewed(client, payload):
    r = client.post(
        "/build",
        json={
            **payload,
            "patch": {
                "capability1": {
                    "vair": "Profiling",
                    "note": "profiling per Art 3(4), not social scoring",
                }
            },
        },
    )
    assert r.status_code == 200
    view = r.json()["view"]
    node = [
        n
        for row in view["rows"]
        if row["property"] == "hasCapability"
        for n in row["nodes"]
        if n["id"] == "capability1"
    ][0]
    assert node["vair"] == "Profiling"
    assert node["provenance"] == "reviewed"
    assert "Art 3(4)" in node["reviewNote"]
    assert view["counts"]["reviewed"] == 1


def test_a_patch_naming_an_invented_vair_term_is_a_client_error(client, payload):
    r = client.post(
        "/build", json={**payload, "patch": {"purpose": {"vair": "Telepathy"}}}
    )
    assert r.status_code == 422
    assert "Telepathy" in r.json()["detail"]


def test_a_qualification_missing_a_required_field_is_a_client_error(client):
    r = client.post("/build", json={"qualification": {"systemName": "x"}})
    assert r.status_code == 422


def test_the_vocabularies_endpoint_lists_the_terms_the_ui_offers(client):
    body = client.get("/vocabularies").json()
    # VAIR nests, so a class's terms include its grandchildren: reading only the
    # direct children would offer 5 techniques out of 17 and hide DeepLearning.
    assert body["AITechnique"] == [
        "BayesianEstimation",
        "BayesianOptimisation",
        "DeepLearning",
        "InductiveProgramming",
        "KnowledgeBasedTechnique",
        "KnowledgeRepresentation",
        "LogicBasedTechnique",
        "MachineLearning",
        "OptimisationMethod",
        "ReasoningTechnique",
        "ReinforcementLearning",
        "SearchMethod",
        "SemiSupervisedLearning",
        "StatisticalTechnique",
        "SupervisedLearning",
        "SymbolicReasoning",
        "UnsupervisedLearning",
    ]
    assert "Model" in body["AIComponent"]
    assert "DecisionTree" in body["AIComponent"]
    assert "API" not in body["AIComponent"]  # malformed IRI in VAIR 1.0
    assert len(body["AICapability"]) == 35
    assert sum(len(v) for v in body.values()) == 350


def test_the_endpoint_covers_every_class_the_card_can_show(client):
    from airo_min.schema import CLASSES

    body = client.get("/vocabularies").json()
    assert set(body) == set(CLASSES)
    # The empty ones are how the UI tells "a term is missing" from "none exists".
    assert body["Risk"] == []
    assert body["AIUser"] == []


def test_the_build_response_carries_the_graphs_identity(client, payload):
    first = client.post("/build", json=payload).json()
    second = client.post("/build", json=payload).json()
    assert first["digest"] == second["digest"]
    assert first["turtle"] != second["turtle"], "blank nodes are relabelled"


# Forms that leave blocks out


def test_r33_description_use_case_and_users_are_optional_now(client, payload):
    """A form may leave those blocks out; the request then omits them."""
    q = {
        k: v
        for k, v in payload["qualification"].items()
        if k not in ("description", "targetUseCase", "targetUsers", "purpose")
    }
    q["risks"] = [r for r in q["risks"] if r["affected"] == "operator"]
    r = client.post("/build", json={"qualification": q})
    assert r.status_code == 200, r.text
    rows = [row["property"] for row in r.json()["view"]["rows"]]
    assert "hasPurpose" not in rows and "hasAIUser" not in rows


def test_r34_a_request_without_a_form_gets_no_coverage_keys(client, payload):
    view = client.post("/build", json=payload).json()["view"]
    assert not {"form", "coverage", "additionalDocumentation"} & set(view)


def _row_node(view, prop):
    return next(r for r in view["rows"] if r["property"] == prop)["nodes"][0]


def test_the_operator_terms_and_a_subject_as_affected_reach_the_graph_over_http(client, payload):
    q = payload["qualification"]
    risks = [{**q["risks"][0], "affected": "JobApplicant"}, *q["risks"][1:]]
    r = client.post("/build", json={**payload, "qualification": {
        **q, "providerTerm": "PublicAuthority", "deployerTerm": "EducationalInstitution", "risks": risks}})
    assert r.status_code == 200
    view = r.json()["view"]
    assert _row_node(view, "isDeployedBy")["vair"] == "EducationalInstitution"
    assert _row_node(view, "isProvidedBy")["vair"] == "PublicAuthority"
    stakeholder = view["chains"][0]["stakeholder"]
    assert stakeholder["cls"] == "AISubject" and stakeholder["vair"] == "JobApplicant"
