"""The PDF card of a card filled with a custom form.

Form-assembly spec (docs/superpowers/form-assembly-2026-09-24/01-spec.md), R36.
Ontology gains `coverage` (the summary line) and `additionalDocumentation` (one
section per owner form); the Overview's description, use case and users rows
are left out when the form did not ask for them. A payload without coverage
renders as before (tests/test_ontology_only_card.py, unchanged).
"""
from pathlib import Path

from models import SystemCard
from template_engine import TemplateEngine

from tests.test_ontology_only_card import ONTOLOGY_ONLY, node, render

ROOT = Path(__file__).resolve().parent.parent

SUMMARY = "Annex IV coverage: 3 of 14 points; Acme AI policy: 18 of 18 answered."


def policy_only() -> dict:
    """Identity only: no description, use case, users, classification, rows or chains."""
    return {
        "system_name": "Acme Vision",
        "system_version": "2.0",
        "provider": "Acme",
        "description": "",
        "target_use_case": "",
        "target_users": "",
        "classification": {"target_systems": [], "sectors": []},
        "ontology": {
            "system": node("system", "Acme Vision 2.0", "AISystem"),
            "rows": [],
            "chains": [],
            "counts": {"nodes": 2, "triples": 12, "risks": 0},
            "coverage": {
                "annex": {
                    "covered": 3,
                    "total": 14,
                    "points": [{"id": "1a", "citation": "Annex IV(1)(a)", "covered": True}],
                },
                "forms": [{"name": "Acme AI policy", "answered": 18, "total": 18}],
                "summary": SUMMARY,
            },
            "additionalDocumentation": [
                {
                    "form": "Acme AI policy",
                    "entries": [
                        {
                            "key": f"f-acme:q{i}",
                            "question": f"Acme question {i}?",
                            "citation": f"Acme AI Policy §{i}",
                            "answer": f"Acme answer {i}.",
                        }
                        for i in range(1, 19)
                    ],
                }
            ],
        },
    }


def test_r36_the_model_takes_coverage_and_additional_documentation():
    card = SystemCard(**policy_only())
    assert card.ontology.coverage.summary == SUMMARY
    assert card.ontology.coverage.annex.covered == 3
    assert card.ontology.additionalDocumentation[0].form == "Acme AI policy"
    assert len(card.ontology.additionalDocumentation[0].entries) == 18


def test_r36_both_default_to_nothing():
    card = SystemCard(**ONTOLOGY_ONLY)
    assert card.ontology.coverage is None
    assert card.ontology.additionalDocumentation == []


def test_r36_a_policy_only_card_renders_with_the_summary_and_its_form():
    html = render(policy_only())
    assert SUMMARY in html
    assert "Acme AI policy" in html
    assert "Acme question 7?" in html
    assert "Acme answer 18." in html
    assert "Acme AI Policy §3" in html


def test_r36_the_summary_is_under_the_ontology_heading():
    html = render(policy_only())
    assert html.index("<h2>Ontology</h2>") < html.index(SUMMARY)


def test_r36_one_section_per_additional_documentation_entry():
    payload = policy_only()
    payload["ontology"]["additionalDocumentation"].append(
        {"form": "Zeta checklist", "entries": [{"key": "f-zeta:q1", "question": "Zeta?", "citation": "", "answer": "Yes."}]}
    )
    html = render(payload)
    assert html.index("Acme AI policy") < html.index("Zeta checklist")
    assert "Zeta?" in html and "Yes." in html


def test_r36_the_empty_overview_rows_are_left_out():
    html = render(policy_only())
    for label in ("<dt>Description</dt>", "<dt>Target use case</dt>", "<dt>Target users</dt>"):
        assert label not in html, label


def test_r36_a_filled_overview_row_is_still_shown():
    payload = policy_only()
    payload["description"] = "Detects empty shelves."
    html = render(payload)
    assert "<dt>Description</dt>" in html
    assert "Detects empty shelves." in html
    assert "<dt>Target use case</dt>" not in html


def test_r36_no_coverage_means_no_summary_line_and_the_card_as_before():
    html = render(ONTOLOGY_ONLY)
    assert "Annex IV coverage" not in html
    assert "<dt>Description</dt>" in html


# ── Addendum 06, R65: optionalBlank on the coverage annex ────────────────────


def test_r65_a_payload_with_optional_blank_validates_and_keeps_it():
    payload = policy_only()
    payload["ontology"]["coverage"]["annex"]["optionalBlank"] = 4
    payload["ontology"]["coverage"]["summary"] = "Annex IV coverage: 10 of 14 points (4 optional left blank)."
    card = SystemCard(**payload)
    assert card.ontology.coverage.annex.optionalBlank == 4
    assert "Annex IV coverage: 10 of 14 points (4 optional left blank)." in render(payload)


def test_r65_a_payload_without_optional_blank_defaults_to_0():
    card = SystemCard(**policy_only())
    assert card.ontology.coverage.annex.optionalBlank == 0
