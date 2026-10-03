"""Owner keys of a question set, in the export's form.

* The per-question owner keys of the export are ownerSet / ownerSetId, or the
  older ownerForm / ownerFormId. Which ones a card sends changes nothing: the
  same graph (digest, Turtle) and the same whole view.
* Coverage and "Additional documentation" group by question set.
  `_owner_key(q)` is ("id", ownerSetId) when present, else ("id", ownerFormId),
  else ("name", ownerSet or ownerForm); the name shown is ownerSet, else
  ownerForm. The output keys (forms, form, additionalDocumentation) and the
  summary strings are the same with either key style, and test_coverage.py
  uses the older keys.
"""
import copy
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from rdflib import Graph
from rdflib.compare import isomorphic

from airo_min.build import _annex_citation

EXAMPLES = Path(__file__).resolve().parents[1] / "examples"
OPTIONAL = {"1b", "1f", "2d", "2f"}
IDS = ["1a", "1b", "1c", "1de", "1f", "1gh", "2a", "2b", "2c", "2d", "2e", "2f", "2g", "2h"]


def _coverage_module():
    # imported per test, so a missing name fails the tests that need it, not the suite
    from airo_min import coverage as module

    return module


@pytest.fixture()
def mcas() -> dict:
    return json.loads((EXAMPLES / "mcas.qualification.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(__import__("app").app)


def annex_question(i: str, style: str) -> dict:
    q = {
        "key": f"annex-{i[0]}:{i}",
        "text": f"Question {i}",
        "citation": _annex_citation({"questionId": i}),
        "required": i not in OPTIONAL,
        "annexPoint": i,
    }
    if style == "old":
        q.update({"ownerForm": "Annex IV default", "ownerFormId": "annex-iv-default"})
    else:
        q.update({"ownerSet": "Annex IV", "ownerSetId": "annex-iv"})
    q["ownerBuiltin"] = True
    return q


def mcas_with_form(mcas: dict, style: str) -> dict:
    """The MCAS example as toExport sends it with the Annex IV default: tagged answers and a form."""
    q = copy.deepcopy(mcas)
    for a in q["answers"]:
        a["citation"] = _annex_citation({"questionId": a["questionId"]})
        a["annexPoint"] = a["questionId"]
    q["form"] = {"name": "Annex IV default", "version": 1, "questions": [annex_question(i, style) for i in IDS]}
    return q


def custom_question(set_id: str, set_name: str, n: int, style: str, point: str | None = None) -> dict:
    q = {
        "key": f"s-{set_id}:q{n}",
        "text": f"{set_name} question {n}?",
        "citation": f"{set_name} §{n}",
        "required": True,
        "annexPoint": point,
    }
    if style == "old":
        q.update({"ownerForm": set_name, "ownerFormId": set_id})
    else:
        q.update({"ownerSet": set_name, "ownerSetId": set_id})
    q["ownerBuiltin"] = False
    return q


def answer(key: str, text: str, point: str | None = None, citation: str = "") -> dict:
    tool, qid = key.split(":")
    return {"toolId": tool, "questionId": qid, "answer": text, "citation": citation, "annexPoint": point}


def build(client: TestClient, q: dict) -> dict:
    response = client.post("/build", json={"qualification": q})
    assert response.status_code == 200, response.text
    return response.json()


# The graph and the view do not depend on the owner keys


def test_t11_the_mcas_card_builds_the_same_graph_with_old_and_new_owner_keys(client, mcas):
    old = build(client, mcas_with_form(mcas, "old"))
    new = build(client, mcas_with_form(mcas, "new"))
    assert new["digest"] == old["digest"]
    # Turtle is not byte-stable between two builds of the same input (blank-node labels),
    # so "the same Turtle" is the same graph once parsed: isomorphic.
    assert isomorphic(Graph().parse(data=new["turtle"], format="turtle"), Graph().parse(data=old["turtle"], format="turtle"))


def test_t11_the_mcas_card_has_the_same_whole_view_with_old_and_new_owner_keys(client, mcas):
    old = build(client, mcas_with_form(mcas, "old"))
    new = build(client, mcas_with_form(mcas, "new"))
    assert new["view"] == old["view"]
    assert new["view"]["coverage"]["summary"] == "Annex IV coverage: 14 of 14 points."
    assert new["view"]["additionalDocumentation"] == []
    assert new["view"]["form"] == {"name": "Annex IV default", "version": 1}


def two_sets_payload(mcas: dict, style: str) -> dict:
    q = copy.deepcopy(mcas)
    q["answers"] = [
        answer("s-acme:q1", "The head of data science.", citation="Acme AI policy §1"),
        answer("s-beta:q1", "Every quarter.", citation="Beta rules §1"),
    ]
    q["form"] = {
        "name": "Two sets",
        "version": 1,
        "questions": [
            custom_question("acme", "Acme AI policy", 1, style),
            custom_question("beta", "Beta rules", 1, style),
        ],
    }
    return q


def test_t11_two_sets_give_the_same_coverage_forms_with_either_key_style(client, mcas):
    old = build(client, two_sets_payload(mcas, "old"))["view"]
    new = build(client, two_sets_payload(mcas, "new"))["view"]
    assert new["coverage"]["forms"] == old["coverage"]["forms"]
    assert new["coverage"]["forms"] == [
        {"name": "Acme AI policy", "answered": 1, "total": 1},
        {"name": "Beta rules", "answered": 1, "total": 1},
    ]


def test_t11_two_sets_give_the_same_additional_documentation_with_either_key_style(client, mcas):
    old = build(client, two_sets_payload(mcas, "old"))["view"]
    new = build(client, two_sets_payload(mcas, "new"))["view"]
    assert new["additionalDocumentation"] == old["additionalDocumentation"]
    assert [s["form"] for s in new["additionalDocumentation"]] == ["Acme AI policy", "Beta rules"]


# Grouped by question set


def test_t43_owner_key_is_the_set_id_first():
    m = _coverage_module()
    q = {"ownerSetId": "acme", "ownerFormId": "old-acme", "ownerSet": "Acme", "ownerForm": "Old"}
    assert m._owner_key(q) == ("id", "acme")


def test_t43_owner_key_falls_back_to_the_form_id():
    m = _coverage_module()
    assert m._owner_key({"ownerFormId": "acme", "ownerForm": "Acme"}) == ("id", "acme")


def test_t43_owner_key_falls_back_to_the_set_name_then_the_form_name():
    m = _coverage_module()
    assert m._owner_key({"ownerSet": "Acme AI policy"}) == ("name", "Acme AI policy")
    assert m._owner_key({"ownerForm": "Acme AI policy"}) == ("name", "Acme AI policy")
    assert m._owner_key({"ownerSet": "New name", "ownerForm": "Old name"}) == ("name", "New name")


def mixed_questionnaire() -> tuple[dict, list[dict]]:
    """Annex IV 2a answered, and two questions of set "Acme AI policy": one tagged 2g, one untagged."""
    annex_2a = annex_question("2a", "new")
    tagged = custom_question("acme", "Acme AI policy", 1, "new", point="2g")
    untagged = custom_question("acme", "Acme AI policy", 2, "new")
    form = {"name": "Mixed", "version": 3, "questions": [annex_2a, tagged, untagged]}
    answers = [
        answer("annex-2:2a", "Built from a pre-trained model.", point="2a", citation="Annex IV(2)(a)"),
        answer("s-acme:q1", "Tested on 2025 data.", point="2g", citation="Acme AI policy §1"),
        answer("s-acme:q2", "The board signs off.", citation="Acme AI policy §2"),
    ]
    return form, answers


def test_t43_the_summary_names_the_set():
    m = _coverage_module()
    form, answers = mixed_questionnaire()
    out = m.coverage(form, answers)
    assert out["summary"] == "Annex IV coverage: 2 of 14 points; Acme AI policy: 2 of 2 answered."
    assert out["forms"] == [{"name": "Acme AI policy", "answered": 2, "total": 2}]


def test_t43_additional_documentation_is_one_section_named_after_the_set():
    m = _coverage_module()
    form, answers = mixed_questionnaire()
    assert m.additional_documentation(form, answers) == [
        {
            "form": "Acme AI policy",
            "entries": [
                {
                    "key": "s-acme:q2",
                    "question": "Acme AI policy question 2?",
                    "citation": "Acme AI policy §2",
                    "answer": "The board signs off.",
                }
            ],
        }
    ]


def test_t43_two_sets_sharing_a_name_but_not_an_id_are_two_entries_and_two_sections():
    m = _coverage_module()
    form = {
        "name": "Same name",
        "version": 1,
        "questions": [
            custom_question("u1", "Custom questions", 1, "new"),
            custom_question("u2", "Custom questions", 1, "new"),
        ],
    }
    answers = [answer("s-u1:q1", "One."), answer("s-u2:q1", "Other one.")]
    out = m.coverage(form, answers)
    assert out["forms"] == [
        {"name": "Custom questions", "answered": 1, "total": 1},
        {"name": "Custom questions", "answered": 1, "total": 1},
    ]
    sections = m.additional_documentation(form, answers)
    assert [s["form"] for s in sections] == ["Custom questions", "Custom questions"]
    assert [[e["key"] for e in s["entries"]] for s in sections] == [["s-u1:q1"], ["s-u2:q1"]]


def test_t43_old_keys_still_group_as_before():
    m = _coverage_module()
    form = {
        "name": "Old caller",
        "version": 1,
        "questions": [custom_question("acme", "Acme AI policy", 1, "old")],
    }
    out = m.coverage(form, [answer("s-acme:q1", "Yes.")])
    assert out["forms"] == [{"name": "Acme AI policy", "answered": 1, "total": 1}]
