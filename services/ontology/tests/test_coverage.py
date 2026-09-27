"""Coverage and "Additional documentation", computed once, in Python.

Form-assembly spec (docs/superpowers/form-assembly-2026-09-24/01-spec.md),
R34 and R35. The card, the JSON export and the PDF all read this one view, so
they cannot disagree about how much of Annex IV a card covers.

  coverage(form, answers) -> {"annex": {...}, "forms": [...], "summary": "..."}
  build_view(graph, form=None, answers=None) adds "form", "coverage" and
  "additionalDocumentation" when a form is given, and nothing otherwise.
"""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from airo_min.build import build_graph
try:
    from airo_min.coverage import coverage
except ImportError as _missing:  # the spec's new module: until it exists each test fails, the suite runs
    def coverage(*_args, _error=_missing, **_kwargs):
        raise _error
from airo_min.view import build_view

EXAMPLES = Path(__file__).resolve().parents[1] / "examples"
IDS = ["1a", "1b", "1c", "1de", "1f", "1gh", "2a", "2b", "2c", "2d", "2e", "2f", "2g", "2h"]
CITATIONS = [
    "Annex IV(1)(a)", "Annex IV(1)(b)", "Annex IV(1)(c)", "Annex IV(1)(d)-(e)", "Annex IV(1)(f)",
    "Annex IV(1)(g)-(h)", "Annex IV(2)(a)", "Annex IV(2)(b)", "Annex IV(2)(c)", "Annex IV(2)(d)",
    "Annex IV(2)(e)", "Annex IV(2)(f)", "Annex IV(2)(g)", "Annex IV(2)(h)",
]


def seeded(i: str) -> dict:
    return {
        "key": f"annex-{i[0]}:{i}",
        "text": f"Question {i}",
        "citation": CITATIONS[IDS.index(i)],
        "required": i not in {"1b", "1f", "2d", "2f"},
        "annexPoint": i,
        "ownerForm": "Annex IV default",
        "ownerBuiltin": True,
    }


def acme(n: int, point: str | None = None, owner: str = "Acme AI policy", scope: str = "f-acme") -> dict:
    return {
        "key": f"{scope}:q{n}",
        "text": f"{owner} question {n}?",
        "citation": f"{owner} §{n}",
        "required": True,
        "annexPoint": point,
        "ownerForm": owner,
        "ownerBuiltin": False,
    }


def answer(key: str, text: str, point: str | None = None, citation: str = "") -> dict:
    tool, qid = key.split(":")
    return {"toolId": tool, "questionId": qid, "answer": text, "citation": citation, "annexPoint": point}


DEFAULT_FORM = {"name": "Annex IV default", "version": 1, "questions": [seeded(i) for i in IDS]}


@pytest.fixture()
def mcas() -> dict:
    return json.loads((EXAMPLES / "mcas.qualification.json").read_text(encoding="utf-8"))


def tagged(q: dict) -> list[dict]:
    return [{**a, "citation": CITATIONS[IDS.index(a["questionId"])], "annexPoint": a["questionId"]} for a in q["answers"]]


def policy_only():
    tags = {1: "1a", 5: "2a", 9: "2g"}
    form = {"name": "Acme AI policy", "version": 2, "questions": [acme(n, tags.get(n)) for n in range(1, 19)]}
    answers = [answer(f"f-acme:q{n}", f"Acme answer {n}.", tags.get(n)) for n in range(1, 19)]
    return form, answers


# ── R34 ───────────────────────────────────────────────────────────────────


def test_r34_the_shape():
    form, answers = policy_only()
    out = coverage(form, answers)
    assert set(out) == {"annex", "forms", "summary"}
    # addendum 06 (R65): annex gains optionalBlank; points keep their shape
    assert set(out["annex"]) == {"covered", "total", "points", "optionalBlank"}
    assert out["annex"]["total"] == 14
    assert [p["id"] for p in out["annex"]["points"]] == IDS
    assert [p["citation"] for p in out["annex"]["points"]] == CITATIONS
    assert all(set(p) == {"id", "citation", "covered"} for p in out["annex"]["points"])


def test_r34_a_policy_only_form_with_three_tagged_questions():
    form, answers = policy_only()
    out = coverage(form, answers)
    assert out["annex"]["covered"] == 3
    assert [p["id"] for p in out["annex"]["points"] if p["covered"]] == ["1a", "2a", "2g"]
    assert out["forms"] == [{"name": "Acme AI policy", "answered": 18, "total": 18}]
    assert out["summary"] == "Annex IV coverage: 3 of 14 points; Acme AI policy: 18 of 18 answered."


def test_r34_the_mcas_example_as_the_form_has_it_covers_all_14():
    """The committed JSON answers 1(f) too, as src/data/examples/mcas.ts does (addendum 06, R72)."""
    q = json.loads((EXAMPLES / "mcas.qualification.json").read_text(encoding="utf-8"))
    out = coverage(DEFAULT_FORM, tagged(q))
    assert out["summary"] == "Annex IV coverage: 14 of 14 points."
    assert out["forms"] == []


def test_r34_a16_the_mcas_export_without_1f_covers_13_with_one_optional_blank(mcas):
    """MCAS with its optional 1(f) answer removed (a copy): a skipped optional
    Annex question lowers the Annex count (A16), and the summary says it was
    optional (addendum 06, R65, R72)."""
    without_1f = [a for a in tagged(mcas) if a["questionId"] != "1f"]
    assert len(without_1f) == 13
    out = coverage(DEFAULT_FORM, without_1f)
    assert out["annex"]["covered"] == 13
    assert out["summary"] == "Annex IV coverage: 13 of 14 points (1 optional left blank)."


def test_r34_a_blank_answer_does_not_count():
    form, answers = policy_only()
    answers[0]["answer"] = "   "  # q1, the one tagged 1a
    out = coverage(form, answers)
    assert out["annex"]["covered"] == 2
    assert out["forms"] == [{"name": "Acme AI policy", "answered": 17, "total": 18}]


def test_r34_one_entry_per_non_builtin_owner_in_first_appearance_order():
    form = {
        "name": "Mixed",
        "version": 1,
        "questions": [seeded("2a"), acme(1, owner="Zeta checklist", scope="f-zeta"), acme(1), acme(2),
                      acme(2, owner="Zeta checklist", scope="f-zeta")],
    }
    answers = [
        answer("annex-2:2a", "Built from a model.", "2a"),
        answer("f-zeta:q1", "Yes."),
        answer("f-acme:q2", "Weekly."),
    ]
    out = coverage(form, answers)
    assert out["forms"] == [
        {"name": "Zeta checklist", "answered": 1, "total": 2},
        {"name": "Acme AI policy", "answered": 1, "total": 2},
    ]
    assert out["annex"]["covered"] == 1
    assert out["summary"] == (
        "Annex IV coverage: 1 of 14 points; Zeta checklist: 1 of 2 answered; Acme AI policy: 1 of 2 answered."
    )


def test_r34_an_answer_whose_key_is_not_in_the_form_counts_for_nothing():
    form, answers = policy_only()
    answers.append(answer("f-other:q1", "Stray.", "2h"))
    assert coverage(form, answers)["annex"]["covered"] == 3


def test_r34_no_form_means_no_coverage_keys_in_the_view(mcas):
    view = build_view(build_graph(mcas))
    for key in ("coverage", "form", "additionalDocumentation"):
        assert key not in view


def test_r34_with_a_form_the_view_carries_form_and_coverage(mcas):
    answers = tagged(mcas)
    view = build_view(build_graph({**mcas, "answers": answers}), form=DEFAULT_FORM, answers=answers)
    assert view["form"] == {"name": "Annex IV default", "version": 1}
    assert view["coverage"]["summary"] == "Annex IV coverage: 14 of 14 points."


# ── R35 ───────────────────────────────────────────────────────────────────


def test_r35_the_mcas_default_card_has_no_additional_documentation(mcas):
    answers = tagged(mcas)
    view = build_view(build_graph({**mcas, "answers": answers}), form=DEFAULT_FORM, answers=answers)
    assert view["additionalDocumentation"] == []


def test_r35_one_section_per_owner_listing_its_answered_untagged_questions_in_version_order(mcas):
    form = {
        "name": "Mixed",
        "version": 3,
        "questions": [
            acme(3), seeded("2a"), acme(1, "2g"), acme(2),
            acme(1, owner="Zeta checklist", scope="f-zeta"), acme(4),
        ],
    }
    answers = [
        answer("f-acme:q2", "Weekly review."),
        answer("f-acme:q3", "The head of data science.", citation="Acme AI Policy §3"),
        answer("annex-2:2a", "Built from a model.", "2a"),
        answer("f-acme:q1", "Tagged, so it is in the graph instead.", "2g"),
        answer("f-zeta:q1", "Yes."),
        answer("f-acme:q4", "   "),
    ]
    view = build_view(build_graph({**mcas, "answers": answers}), form=form, answers=answers)
    assert view["additionalDocumentation"] == [
        {
            "form": "Acme AI policy",
            "entries": [
                {"key": "f-acme:q3", "question": "Acme AI policy question 3?", "citation": "Acme AI policy §3",
                 "answer": "The head of data science."},
                {"key": "f-acme:q2", "question": "Acme AI policy question 2?", "citation": "Acme AI policy §2",
                 "answer": "Weekly review."},
            ],
        },
        {
            "form": "Zeta checklist",
            "entries": [
                {"key": "f-zeta:q1", "question": "Zeta checklist question 1?", "citation": "Zeta checklist §1",
                 "answer": "Yes."},
            ],
        },
    ]


def test_r35_a_policy_only_card_through_the_service():
    from tests.test_absent_blocks import policy_only as qualification

    q = qualification()
    form, _answers = policy_only()
    tags = {1: "1a", 5: "2a", 9: "2g"}
    for n, a in enumerate(q["answers"], start=1):
        a["annexPoint"] = tags.get(n)
    q["form"] = form
    body = TestClient(__import__("app").app).post("/build", json={"qualification": q}).json()
    assert body["view"]["coverage"]["summary"] == (
        "Annex IV coverage: 3 of 14 points; Acme AI policy: 18 of 18 answered."
    )
    assert len(body["view"]["additionalDocumentation"][0]["entries"]) == 15
    assert body["view"]["form"] == {"name": "Acme AI policy", "version": 2}


# ── R41 no model ───────────────────────────────────────────────────────────


def test_r41_coverage_imports_only_the_standard_library_and_this_package():
    import ast
    import sys

    source = Path(__file__).resolve().parents[1] / "airo_min" / "coverage.py"
    assert source.exists(), source
    names = set()
    for node in ast.walk(ast.parse(source.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            names |= {a.name.split(".")[0] for a in node.names}
        elif isinstance(node, ast.ImportFrom) and node.level == 0:
            names.add(node.module.split(".")[0])
    outside = {n for n in names if n not in sys.stdlib_module_names and n not in {"airo_min", "__future__"}}
    assert outside == set()


# ── Addendum 06 (docs/superpowers/form-assembly-2026-09-24/06-spec-addendum.md) ──
# R65: optional points left blank; R66: legacy cards; R69: grouping by owner id.

OPTIONAL = {"1b", "1f", "2d", "2f"}


def default_answers(blank: set[str]) -> list[dict]:
    return [answer(f"annex-{i[0]}:{i}", f"Answer {i}.", i) for i in IDS if i not in blank]


def test_r65_default_form_all_answered():
    out = coverage(DEFAULT_FORM, default_answers(set()))
    assert out["summary"] == "Annex IV coverage: 14 of 14 points."
    assert out["annex"]["optionalBlank"] == 0


def test_r65_r66_default_form_with_the_four_optional_points_blank():
    """Also the legacy card of R66: exported with the default version."""
    out = coverage(DEFAULT_FORM, default_answers(OPTIONAL))
    assert out["summary"] == "Annex IV coverage: 10 of 14 points (4 optional left blank)."
    assert out["annex"]["optionalBlank"] == 4
    assert out["annex"]["covered"] == 10


def test_r65_one_optional_blank_is_singular():
    out = coverage(DEFAULT_FORM, default_answers({"1f"}))
    assert out["summary"] == "Annex IV coverage: 13 of 14 points (1 optional left blank)."


def test_r65_b4_a_policy_only_form_does_not_mention_points_it_never_asks():
    form, answers = policy_only()
    out = coverage(form, answers)
    assert out["summary"] == "Annex IV coverage: 3 of 14 points; Acme AI policy: 18 of 18 answered."
    assert out["annex"]["optionalBlank"] == 0


def test_r65_the_policy_form_with_its_optional_2g_question_blank():
    form, answers = policy_only()
    form["questions"][8]["required"] = False  # q9, tagged 2g
    answers = [a for a in answers if a["questionId"] != "q9"]
    out = coverage(form, answers)
    assert out["summary"] == (
        "Annex IV coverage: 2 of 14 points (1 optional left blank); Acme AI policy: 17 of 18 answered."
    )


def test_r65_a_form_with_no_questions():
    out = coverage({"name": "Identity only", "version": 1, "questions": []}, [])
    assert out["summary"] == "Annex IV coverage: 0 of 14 points."
    assert out["annex"]["optionalBlank"] == 0


def test_r65_a_blank_required_tagged_question_is_neither_covered_nor_optional_blank():
    out = coverage(DEFAULT_FORM, default_answers({"1a"}))
    assert out["annex"]["covered"] == 13
    assert out["annex"]["optionalBlank"] == 0
    assert out["summary"] == "Annex IV coverage: 13 of 14 points."


def test_r65_a_point_asked_optionally_and_required_is_not_optional_blank():
    form = {"name": "Mixed", "version": 1, "questions": [acme(1, "2a"), {**acme(2, "2a"), "required": False}]}
    out = coverage(form, [])
    assert out["annex"]["optionalBlank"] == 0


def test_r65_the_points_keep_their_shape():
    out = coverage(DEFAULT_FORM, default_answers(OPTIONAL))
    assert all(set(p) == {"id", "citation", "covered"} for p in out["annex"]["points"])


def test_r65_optional_blank_travels_through_build_view(mcas):
    answers = [a for a in tagged(mcas) if a["questionId"] not in OPTIONAL]
    view = build_view(build_graph({**mcas, "answers": answers}), form=DEFAULT_FORM, answers=answers)
    assert view["coverage"]["annex"]["optionalBlank"] == 4
    assert view["coverage"]["summary"] == "Annex IV coverage: 10 of 14 points (4 optional left blank)."


def test_r72_the_committed_mcas_export_covers_14_of_14(mcas):
    assert len(mcas["answers"]) == 14
    out = coverage(DEFAULT_FORM, tagged(mcas))
    assert out["summary"] == "Annex IV coverage: 14 of 14 points."


def once(n: int, owner_id: str, point: str | None = None) -> dict:
    return {**acme(n, point, owner="Custom questions", scope=f"f-{owner_id}"), "ownerFormId": owner_id}


def test_r69_two_owners_sharing_a_name_are_two_entries_and_two_sections():
    form = {"name": "Mixed once", "version": 1, "questions": [once(1, "u1"), once(2, "u1"), once(1, "u2")]}
    answers = [answer("f-u1:q1", "One."), answer("f-u2:q1", "Other one.")]
    out = coverage(form, answers)
    assert out["forms"] == [
        {"name": "Custom questions", "answered": 1, "total": 2},
        {"name": "Custom questions", "answered": 1, "total": 1},
    ]
    assert out["summary"] == (
        "Annex IV coverage: 0 of 14 points; Custom questions: 1 of 2 answered; Custom questions: 1 of 1 answered."
    )


def test_r69_additional_documentation_has_one_section_per_owner_id(mcas):
    from airo_min.coverage import additional_documentation

    form = {"name": "Mixed once", "version": 1, "questions": [once(1, "u1"), once(1, "u2"), once(2, "u1")]}
    answers = [answer("f-u1:q1", "One."), answer("f-u2:q1", "Other one."), answer("f-u1:q2", "Two.")]
    sections = additional_documentation(form, answers)
    assert [s["form"] for s in sections] == ["Custom questions", "Custom questions"]
    assert [[e["key"] for e in s["entries"]] for s in sections] == [["f-u1:q1", "f-u1:q2"], ["f-u2:q1"]]


def test_r69_questions_without_owner_form_id_still_group_by_name():
    form = {"name": "Old caller", "version": 1, "questions": [acme(1), acme(2)]}
    out = coverage(form, [answer("f-acme:q1", "Yes.")])
    assert out["forms"] == [{"name": "Acme AI policy", "answered": 1, "total": 2}]
