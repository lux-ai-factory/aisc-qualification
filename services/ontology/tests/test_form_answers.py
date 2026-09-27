"""Answers from custom forms, in the graph.

Form-assembly spec (docs/superpowers/form-assembly-2026-09-24/01-spec.md):

* R7: the default form's answers, now exported with `citation` and
  `annexPoint` and a `form`, build the very same graph as the legacy export
  (same digest): cards handed over before and after describe the same graph.
* R31: an answer tagged with an Annex point becomes a qual:answer under that
  point's citation; an untagged one (annexPoint null) is not in the graph at
  all (A17); an answer with no annexPoint key (legacy, the CLI) is as today.
"""
import copy
import json
from pathlib import Path

import pytest
from rdflib import Literal

from airo_min.build import QUAL, _annex_citation, build_graph
from airo_min.graph import graph_digest
from airo_min.validate import validate
from airo_min.view import build_view

EXAMPLES = Path(__file__).resolve().parents[1] / "examples"
OPTIONAL = {"1b", "1f", "2d", "2f"}
DEFAULT_IDS = ["1a", "1b", "1c", "1de", "1f", "1gh", "2a", "2b", "2c", "2d", "2e", "2f", "2g", "2h"]


@pytest.fixture()
def mcas() -> dict:
    return json.loads((EXAMPLES / "mcas.qualification.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def extracted() -> dict:
    return json.loads((EXAMPLES / "mcas.extracted.json").read_text(encoding="utf-8"))


def default_form() -> dict:
    """The default version as toExport sends it (spec 5.3)."""
    return {
        "name": "Annex IV default",
        "version": 1,
        "questions": [
            {
                "key": f"annex-{i[0]}:{i}",
                "text": f"Question {i}",
                "citation": _annex_citation({"questionId": i}),
                "required": i not in OPTIONAL,
                "annexPoint": i,
                "ownerForm": "Annex IV default",
                "ownerBuiltin": True,
            }
            for i in DEFAULT_IDS
        ],
    }


def as_new_export(q: dict) -> dict:
    """What the new toExport(q, defaultVersion) produces for a legacy card."""
    out = copy.deepcopy(q)
    for a in out["answers"]:
        a["citation"] = _annex_citation({"questionId": a["questionId"]})
        a["annexPoint"] = a["questionId"]
    out["form"] = default_form()
    return out


def answer_nodes(g):
    """Every qual:answer, as {questionId: {predicate local name: [values]}}."""
    out = {}
    for _s, node in g.subject_objects(QUAL.answer):
        props = {}
        for p, o in g.predicate_objects(node):
            props.setdefault(str(p).rsplit("#", 1)[-1], []).append(str(o))
        out[props["questionId"][0]] = props
    return out


# ── R7: the default form builds the legacy graph ──────────────────────────


def test_r7_the_default_form_export_builds_the_same_graph_as_the_legacy_export(mcas, extracted):
    legacy = build_graph(mcas, extracted)
    new = build_graph(as_new_export(mcas), extracted)
    assert graph_digest(new) == graph_digest(legacy)
    assert len(new) == len(legacy)


def test_r7_default_answers_keep_their_citation_and_question_id(mcas, extracted):
    nodes = answer_nodes(build_graph(as_new_export(mcas), extracted))
    assert nodes["annex-1:1de"]["citation"] == ["Annex IV(1)(d)-(e)"]
    assert nodes["annex-2:2h"]["citation"] == ["Annex IV(2)(h)"]
    for props in nodes.values():
        assert "annexPoint" not in props
        assert "sourceCitation" not in props


# ── R31: tagged, untagged, legacy ─────────────────────────────────────────


def custom(mcas: dict, *answers: dict) -> dict:
    q = copy.deepcopy(mcas)
    q["answers"] = list(answers)
    return q


TAGGED = {
    "toolId": "f-clx9abc",
    "questionId": "q1",
    "answer": "We fine-tuned a pre-trained gradient boosting model.",
    "citation": "Acme AI Policy §4.2",
    "annexPoint": "2a",
}
UNTAGGED = {
    "toolId": "f-clx9abc",
    "questionId": "q2",
    "answer": "The head of data science signs off every release.",
    "citation": "Acme AI Policy §7",
    "annexPoint": None,
}


def test_r31_a_tagged_custom_answer_is_an_answer_under_its_point(mcas):
    g = build_graph(custom(mcas, TAGGED))
    node = answer_nodes(g)["f-clx9abc:q1"]
    assert node["citation"] == ["Annex IV(2)(a)"]  # never the free-text citation
    assert node["text"] == [TAGGED["answer"]]
    assert node["annexPoint"] == ["2a"]
    assert node["sourceCitation"] == ["Acme AI Policy §4.2"]
    assert validate(g) == []


def test_r31_a_tagged_custom_answer_with_no_citation_has_no_source_citation(mcas):
    g = build_graph(custom(mcas, {**TAGGED, "citation": ""}))
    node = answer_nodes(g)["f-clx9abc:q1"]
    assert node["annexPoint"] == ["2a"]
    assert "sourceCitation" not in node


def test_r31_a_seeded_answer_with_its_tag_gets_nothing_more_than_today(mcas):
    seeded = {"toolId": "annex-2", "questionId": "2a", "answer": "Built from a model.",
              "citation": "Annex IV(2)(a)", "annexPoint": "2a"}
    legacy = {"toolId": "annex-2", "questionId": "2a", "answer": "Built from a model."}
    assert graph_digest(build_graph(custom(mcas, seeded))) == graph_digest(build_graph(custom(mcas, legacy)))


def test_r31_an_untagged_answer_is_nowhere_in_the_graph(mcas):
    g = build_graph(custom(mcas, TAGGED, UNTAGGED))
    turtle = g.serialize(format="turtle")
    assert UNTAGGED["answer"] not in turtle
    assert "f-clx9abc:q2" not in turtle
    assert (None, None, Literal(UNTAGGED["answer"])) not in g
    assert set(answer_nodes(g)) == {"f-clx9abc:q1"}


def test_r31_untagged_answers_do_not_change_the_digest(mcas):
    assert graph_digest(build_graph(custom(mcas, TAGGED, UNTAGGED))) == graph_digest(
        build_graph(custom(mcas, TAGGED))
    )


def test_r31_an_answer_without_the_annex_point_key_is_read_as_today(mcas):
    legacy = {"toolId": "annex-2", "questionId": "2d", "answer": "Two labelled sets."}
    node = answer_nodes(build_graph(custom(mcas, legacy)))["annex-2:2d"]
    assert node["citation"] == [_annex_citation(legacy)] == ["Annex IV(2)(d)"]
    assert "annexPoint" not in node


def test_r31_the_new_properties_are_ours_not_airo(mcas):
    g = build_graph(custom(mcas, TAGGED))
    preds = {str(p) for p in g.predicates()}
    assert str(QUAL.annexPoint) in preds and str(QUAL.sourceCitation) in preds
    assert not any(p.endswith("#annexPoint") and "w3id.org/airo" in p for p in preds)


def test_r31_the_view_lists_a_custom_answer_tagged_2a_under_annex_iv_2a(mcas):
    view = build_view(build_graph(custom(mcas, TAGGED, UNTAGGED)))
    assert view["answers"] == [
        {"citation": "Annex IV(2)(a)", "questionId": "f-clx9abc:q1", "text": TAGGED["answer"]}
    ]
