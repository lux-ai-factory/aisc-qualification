"""The graph builds when a form leaves blocks out.

A form may drop the description, the use case, the users, the deployers, the
pickers and the risk block (identity only is a valid form). An absent block
arrives as "" (or null for the deployers, [] for the lists) and must add
nothing rather than an empty node or an exception.
"""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from rdflib import RDF, URIRef

from app import app
from airo_min.build import QUAL, build_graph
from airo_min.schema import AIRO
from airo_min.validate import validate
from airo_min.view import build_view

EXAMPLES = Path(__file__).resolve().parents[1] / "examples"


@pytest.fixture()
def mcas() -> dict:
    return json.loads((EXAMPLES / "mcas.qualification.json").read_text(encoding="utf-8"))


def _a(name: str) -> URIRef:
    return URIRef(AIRO + name)


def system_of(g):
    return next(g.subjects(RDF.type, _a("AISystem")))


def test_r33_an_empty_description_adds_no_description_triple(mcas):
    mcas["description"] = ""
    g = build_graph(mcas)
    assert list(g.objects(system_of(g), QUAL.description)) == []


def test_r33_an_empty_use_case_adds_no_purpose(mcas):
    # Without the use-case block and without a VAIR purpose (a fixed field).
    mcas["targetUseCase"] = ""
    mcas["purpose"] = None
    g = build_graph(mcas)
    assert list(g.objects(system_of(g), _a("hasPurpose"))) == []
    assert list(g.subjects(RDF.type, _a("Purpose"))) == []


def test_r33_empty_users_add_no_ai_user(mcas):
    mcas["targetUsers"] = ""
    mcas["risks"] = [r for r in mcas["risks"] if r["affected"] == "operator"]
    g = build_graph(mcas)
    assert list(g.objects(system_of(g), _a("hasAIUser"))) == []
    assert list(g.subjects(RDF.type, _a("AIUser"))) == []


@pytest.mark.parametrize("deployers", [None, ""])
def test_r33_no_deployers_means_no_deployer_as_today(mcas, deployers):
    mcas["intendedDeployers"] = deployers
    g = build_graph(mcas)
    assert list(g.objects(system_of(g), _a("isDeployedBy"))) == []


def test_r33_a_risk_affecting_users_when_the_form_has_no_users_builds_without_a_stakeholder(mcas):
    mcas["targetUsers"] = ""
    user_risks = [i for i, r in enumerate(mcas["risks"]) if r["affected"] == "user"]
    assert user_risks, "the example has a risk affecting users"
    # with no users block there is no hasAIUser node for the chain to take (the builder's next(iter(...)))
    g = build_graph(mcas)
    view = build_view(g)
    for i in user_risks:
        chain = view["chains"][i]
        assert chain["stakeholder"] is None
        assert chain["risk"] is not None
    impacts_on_users = [
        (s, o) for s, o in g.subject_objects(_a("hasImpactOnStakeholder"))
        if (o, RDF.type, _a("AIUser")) in g
    ]
    assert impacts_on_users == []


def policy_only() -> dict:
    """Identity only, no blocks, 18 untagged answers of an Acme policy."""
    return {
        "id": "policy-1",
        "systemName": "Acme Vision",
        "systemVersion": "2.0",
        "company": "Acme",
        "description": "",
        "targetUseCase": "",
        "targetUsers": "",
        "intendedDeployers": None,
        "targetSystemTags": [],
        "sectorTags": [],
        "marketFormTags": [],
        "localityTags": [],
        "answers": [
            {
                "toolId": "f-acme",
                "questionId": f"q{i}",
                "answer": f"Acme answer {i}.",
                "citation": f"Acme AI Policy §{i}",
                "annexPoint": None,
            }
            for i in range(1, 19)
        ],
        "risks": [],
    }


def test_r33_a_policy_only_qualification_is_a_valid_graph_of_the_system_and_its_provider():
    g = build_graph(policy_only())
    assert validate(g) == []
    named = {s for s in g.subjects() if isinstance(s, URIRef)}
    classes = sorted(
        str(o).replace(AIRO, "") for s in named for o in g.objects(s, RDF.type) if str(o).startswith(AIRO)
    )
    assert classes == ["AIOperator", "AISystem"]
    view = build_view(g)
    assert [row["label"] for row in view["rows"]] == ["Provider"]
    assert view["chains"] == []


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def test_r33_build_accepts_a_request_without_description_use_case_or_users(client):
    q = {k: v for k, v in policy_only().items() if k not in ("description", "targetUseCase", "targetUsers")}
    r = client.post("/build", json={"qualification": q})
    assert r.status_code == 200, r.text
    assert r.json()["problems"] == []


def test_r33_build_of_a_policy_only_form_returns_200_and_no_problems(client):
    q = policy_only()
    q["form"] = {
        "name": "Acme AI policy",
        "version": 1,
        "questions": [
            {
                "key": f"f-acme:q{i}",
                "text": f"Acme question {i}?",
                "citation": f"Acme AI Policy §{i}",
                "required": True,
                "annexPoint": None,
                "ownerForm": "Acme AI policy",
                "ownerBuiltin": False,
            }
            for i in range(1, 19)
        ],
    }
    r = client.post("/build", json={"qualification": q})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["problems"] == []
    assert [row["label"] for row in body["view"]["rows"]] == ["Provider"]
    assert body["view"]["chains"] == []
