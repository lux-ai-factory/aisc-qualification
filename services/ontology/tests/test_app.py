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
    # direct children offered 5 techniques out of 17 and hid DeepLearning.
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
    assert sum(len(v) for v in body.values()) == 331


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
