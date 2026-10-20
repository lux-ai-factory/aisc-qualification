"""The card's classification is VAIR's: capabilities are flat terms, not the older
category / subcategory pairs, and the sectors are VAIR's application domains."""
import copy

from tests.test_ontology_only_card import ONTOLOGY_ONLY, render


def payload(target_systems, sectors):
    p = copy.deepcopy(ONTOLOGY_ONLY)
    p["classification"] = {"target_systems": target_systems, "sectors": sectors}
    return p


def test_a_capability_without_a_category_shows_its_label_alone():
    html = render(payload([{"subcategory": "Natural Language Generation"}], ["Private Service"]))
    assert '<span class="chip">Natural Language Generation</span>' in html
    assert " / Natural Language Generation" not in html


def test_the_rows_are_named_as_the_form_names_them():
    html = render(payload([{"subcategory": "Profiling"}], ["Private Service"]))
    assert "<th>Capabilities</th>" in html
    assert "<th>Application domains</th>" in html
    assert "Private Service" in html


def test_a_card_rendered_from_an_older_payload_keeps_its_pair():
    html = render(payload([{"category": "Predictive & analytical AI", "subcategory": "Risk scoring"}], []))
    assert "Predictive &amp; analytical AI / Risk scoring" in html
