"""The PDF says what the AI drafted and what it could not settle, as the web card does.

The ontology view sends per node `provenance: "extracted"`, `flags` and `flagNotes` ({"why",
"quote"}), and `counts.flagged`. The model dropped flags and notes and the template marked only
reviewed nodes, so the copy kept for the record printed an AI-drafted, flagged technique exactly
like the author's own content.
"""
import copy

from tests.test_ontology_only_card import ONTOLOGY_ONLY, render


def _with_ai_draft() -> dict:
    payload = copy.deepcopy(ONTOLOGY_ONLY)
    payload["ontology"]["rows"].append(
        {
            "property": "usesTechnique",
            "label": "Techniques",
            "citation": "Annex IV 2(a)",
            "nodes": [
                {
                    "id": "technique0",
                    "label": "Quantum annealing solver",
                    "cls": "AITechnique",
                    "provenance": "extracted",
                    "derivedFrom": "Annex IV(2)(a)",
                    "flags": ["ungrounded"],
                    "flagNotes": [{"why": "The answer names no such solver.", "quote": "gradient-boosted tree"}],
                }
            ],
        }
    )
    payload["ontology"]["chains"][0]["control"]["flags"] = ["inconsistent"]
    payload["ontology"]["counts"]["flagged"] = 2
    return payload


def test_an_ai_drafted_node_is_marked_with_where_it_came_from():
    html = render(_with_ai_draft())
    assert "AI draft" in html
    assert "Annex IV(2)(a)" in html


def test_open_flags_and_their_notes_are_printed():
    html = render(_with_ai_draft())
    assert "ungrounded" in html
    assert "The answer names no such solver." in html
    assert "gradient-boosted tree" in html
    # a chain node's flag too, with the web card's label for it
    assert "check" in html.split("Officer review of rejections", 1)[1][:300]


def test_the_count_of_flagged_items_is_printed():
    assert "2 item(s) flagged" in render(_with_ai_draft())


def test_a_form_node_carries_no_ai_mark():
    assert "AI draft" not in render(copy.deepcopy(ONTOLOGY_ONLY))
