"""The PDF uses the same words as the web card.

Two numbers must not be confused: the AI card's own version (vN) and the release of the
system it describes, printed as "System release" without a "v". The sections read
"Identification and use" and "Risk identification"; ontology codes, graph counts and em
dashes stay out of what a reader sees.
"""
import copy

from tests.test_ontology_only_card import ONTOLOGY_ONLY, render


def _card(**over) -> dict:
    payload = copy.deepcopy(ONTOLOGY_ONLY)
    payload.update(over)
    return payload


def test_the_release_reads_system_release_without_a_v():
    html = render(_card(system_version="v2.4.0"))
    assert "System release 2.4.0" in html
    assert "v2.4.0" not in html
    assert "<th>Version</th>" not in html
    assert "<th>System release</th>" in html


def test_the_sections_use_the_card_words():
    html = render(_card())
    assert "<h3>Identification and use</h3>" in html
    assert "<h3>Risk identification</h3>" in html
    assert "About the system" not in html


def test_no_ontology_jargon_or_codes():
    payload = _card()
    payload["ontology"]["rows"][0]["nodes"][0]["vair"] = "CreditScoring"
    html = render(payload)
    assert "CreditScoring" in html
    assert "vair:" not in html
    assert "AIRO graph" not in html
    assert "triples" not in html


def test_no_em_dash_in_what_is_printed():
    payload = _card()
    payload["classification"] = {"target_systems": [], "sectors": []}
    assert "—" not in render(payload)
    assert "&mdash;" not in render(payload)
