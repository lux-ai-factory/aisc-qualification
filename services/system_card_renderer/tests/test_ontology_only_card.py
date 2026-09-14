"""The card renders from the ontology alone, with no LLM prose.

The filled AIRO graph IS the AI card. The written sections (overview,
findings) are an optional extra, so a payload carrying only the form's metadata
and the graph has to validate and render: that is what the Download PDF button
in the vertical view sends when nobody has generated the prose.
"""
from pathlib import Path

import pytest
from pydantic import ValidationError

from models import SystemCard
from template_engine import TemplateEngine

ROOT = Path(__file__).resolve().parent.parent


def render(payload: dict) -> str:
    """The template, rendered the way the service renders it.

    SystemCardRenderer.render_html passes `card.model_dump()`, so the template
    sees a plain dict and a model @property is invisible to it. Rendering the
    model directly here would test a path the service never takes.
    """
    return TemplateEngine(ROOT / "templates").render(
        "system_card.html.j2", card=SystemCard(**payload).model_dump()
    )


def node(node_id: str, label: str, cls: str) -> dict:
    return {"id": node_id, "label": label, "cls": cls}


# Exactly the shape src/app/api/qualifications/[id]/system-card.pdf/route.ts
# sends when systemCardJson is null.
ONTOLOGY_ONLY = {
    "system_name": "MicroCredit Assist Score (MCAS)",
    "system_version": "v1.2.0",
    "provider": "Creditum AI SARL",
    "description": "Scores consumer loan applications.",
    "target_use_case": "Pre-screening consumer loans.",
    "target_users": "Loan officers; applicants.",
    "classification": {
        "target_systems": [
            {"category": "Predictive & analytical AI", "subcategory": "Risk scoring"}
        ],
        "sectors": ["Economy"],
    },
    "ontology": {
        "system": node("system", "MicroCredit Assist Score", "AISystem"),
        "rows": [
            {
                "property": "hasPurpose",
                "label": "Purpose",
                "citation": "Annex IV 1(a)",
                "nodes": [node("purpose", "Score loan applications", "AIPurpose")],
            }
        ],
        "chains": [
            {
                "citation": "Art 9(2)",
                "risk": node("risk0", "A creditworthy applicant is rejected", "Risk"),
                "source": node("risk0_source", "Postcode proxy variables", "RiskSource"),
                "consequence": node(
                    "risk0_consequence", "The applicant loses credit access", "Consequence"
                ),
                "control": node("risk0_control", "Officer review of rejections", "RiskControl"),
                "areas": [node("area_right", "Fundamental rights", "ImpactOnArea")],
            }
        ],
        "counts": {"nodes": 8, "triples": 24, "risks": 1},
    },
}


def test_a_card_without_prose_is_a_valid_card():
    card = SystemCard(**ONTOLOGY_ONLY)
    assert card.overview == ""
    assert card.findings == []
    assert card.ontology is not None


def test_the_ontology_sections_render():
    html = render(ONTOLOGY_ONLY)
    assert "A creditworthy applicant is rejected" in html
    assert "Officer review of rejections" in html
    assert "Score loan applications" in html
    # the metadata the form supplies, not the prose
    assert "Creditum AI SARL" in html
    assert "Pre-screening consumer loans." in html


def test_no_empty_overview_paragraph_when_there_is_no_prose():
    html = render(ONTOLOGY_ONLY)
    assert "<p></p>" not in html


def test_the_prose_still_renders_when_it_exists():
    payload = dict(
        ONTOLOGY_ONLY,
        overview="MCAS scores short-term consumer loan applications.",
        findings=[{"title": "Data governance", "summary": "Applicant data only.", "points": ["No special categories."]}],
    )
    html = render(payload)
    assert "MCAS scores short-term consumer loan applications." in html
    assert "Data governance" in html


def test_a_node_no_term_can_describe_shows_its_class_not_a_gap():
    """"no term" reads as a gap someone forgot to close.

    For a Risk, or for the commercial provider, no term exists to close it with:
    VAIR does not subdivide Risk, and its 17 AIOperator terms are all Annex III
    public bodies. The view says so per node with termExpected: false.
    """
    payload = dict(ONTOLOGY_ONLY)
    payload["ontology"] = dict(
        ONTOLOGY_ONLY["ontology"],
        rows=[
            {
                "property": "isProvidedBy",
                "label": "Provider",
                "citation": "Annex IV 1(a)",
                "nodes": [
                    {
                        **node("provider", "Creditum AI SARL", "AIOperator"),
                        "termExpected": False,
                    }
                ],
            }
        ],
    )
    html = render(payload)
    assert "no term" not in html
    assert "AIOperator" in html


def test_a_node_that_really_is_missing_a_term_is_still_flagged():
    payload = dict(ONTOLOGY_ONLY)
    payload["ontology"] = dict(
        ONTOLOGY_ONLY["ontology"],
        rows=[
            {
                "property": "hasPurpose",
                "label": "Purpose",
                "citation": "Annex IV 1(a)",
                "nodes": [node("purpose", "Score loan applications", "Purpose")],
            }
        ],
    )
    assert "no term" in render(payload)


def test_a_card_still_needs_the_facts_the_form_collects():
    with pytest.raises(ValidationError):
        SystemCard(**{k: v for k, v in ONTOLOGY_ONLY.items() if k != "provider"})


def _html(**over) -> str:
    return render(dict(ONTOLOGY_ONLY, **over))


def test_a_version_that_already_says_v_is_not_prefixed_again():
    # The form stores what the provider typed, and providers type "v1.2.0".
    # The cover used to render that as "vv1.2.0".
    html = _html(system_version="v1.2.0")
    assert "vv1.2.0" not in html
    assert "Creditum AI SARL \u00b7 v1.2.0" in subtitle(html)


def test_a_bare_version_still_gets_its_v():
    html = _html(system_version="1.2.0")
    assert "Creditum AI SARL \u00b7 v1.2.0" in subtitle(html)


def subtitle(html: str) -> str:
    """The cover line under the title: provider, version, date."""
    start = html.index('<p class="subtitle">')
    return " ".join(html[start : html.index("</p>", start)].split())
