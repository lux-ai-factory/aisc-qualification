"""Refine with AI names the long answers: the names it drafts, and the ones it will not keep."""
import pytest

from fill.names import draft_names, nameable
from fill.view_nodes import nodes_of
from tests.views import MCAS_VIEW

NODES = [
    {"id": "purpose", "cls": "Purpose", "label": "Assess the...", "fullText": "Assess the creditworthiness of consumer loan applicants for retail banks", "provenance": "form"},
    {"id": "system", "cls": "AISystem", "label": "MCAS 1", "fullText": None, "provenance": "form"},
    {"id": "technique0", "cls": "AITechnique", "label": "x", "fullText": "long long", "provenance": "extracted"},
]


def _row(prop):
    return next(r for r in MCAS_VIEW["rows"] if r["property"] == prop)["nodes"][0]


def test_the_long_answers_of_the_real_card_view_are_named():
    texts = nameable(nodes_of(MCAS_VIEW))
    for node_id, prop in (("purpose", "hasPurpose"), ("provider", "isProvidedBy"),
                          ("deployer", "isDeployedBy"), ("users", "hasAIUser")):
        assert texts[node_id] == _row(prop)["fullText"]
    chain = MCAS_VIEW["chains"][0]
    assert texts["risk0"] == chain["risk"]["fullText"] and texts["risk0_source"] == chain["source"]["fullText"]


def test_only_long_form_texts_are_named():
    assert nameable(NODES) == {"purpose": NODES[0]["fullText"]}


@pytest.mark.parametrize("cls", ["AITechnique", "AIComponent"])
def test_a_node_the_builder_takes_no_name_for_is_not_named(cls):
    node = {"id": "t", "cls": cls, "label": "x", "fullText": "long text here", "provenance": "form"}
    assert nameable([node]) == {}


def test_a_good_name_is_kept_with_its_text():
    text = NODES[0]["fullText"]
    names, gave_up = draft_names({"purpose": text}, lambda *a, **k: '{"purpose": "Consumer loan creditworthiness"}')
    assert names == {"purpose": {"name": "Consumer loan creditworthiness", "of": text}}
    assert gave_up == []


def test_a_name_not_taken_from_its_text_is_asked_again_then_dropped():
    calls = []

    def complete(*a, **k):
        calls.append(1)
        return '{"purpose": "Mortgage fraud detection"}'

    names, gave_up = draft_names({"purpose": "Assess the creditworthiness of consumer loan applicants"}, complete, max_rounds=2)
    assert names == {} and len(calls) == 2
    assert gave_up[0]["node"] == "purpose"


def test_only_the_names_that_failed_are_asked_again():
    texts = {"a": "Assess the creditworthiness of consumer loan applicants", "b": "Monitor transactions for fraud across retail accounts"}
    users = []

    def complete(system, user, **k):
        users.append(user)
        if len(users) == 1:
            return '{"a": "Consumer loan creditworthiness", "b": "Astronomy"}'
        return '{"b": "Retail transaction fraud monitoring"}'

    names, gave_up = draft_names(texts, complete)
    assert set(names) == {"a", "b"} and gave_up == []
    assert "a: Assess" not in users[1] and "b: Monitor" in users[1]


def test_malformed_json_names_nothing():
    names, gave_up = draft_names({"purpose": "Assess the creditworthiness of applicants"}, lambda *a, **k: "sure! here")
    assert names == {} and gave_up


def test_nothing_to_name_asks_nothing():
    def complete(*a, **k):
        raise AssertionError("no call expected")

    assert draft_names({}, complete) == ({}, [])


def test_a_name_that_is_long_in_utf16_units_is_asked_again():
    text = "Assess the creditworthiness of consumer loan applicants"
    names, gave_up = draft_names({"p": text}, lambda *a, **k: '{"p": "creditworthiness ' + "\U0001F600" * 31 + '"}', max_rounds=1)
    assert names == {} and gave_up[0]["node"] == "p"
