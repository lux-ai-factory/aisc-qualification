"""Refine with AI points at choices the card's own answers contradict, and changes nothing."""
import json

import pytest

from fill.consistency import check
from fill.prompts import consistency_prompt
from fill.workflow import run_fill
from tests.test_workflow import QUALIFICATION, TERMS, FakeCompleter
from tests.views import MCAS_VIEW, in_a_row

ANSWERS = [{"annexPoint": "2a", "answer": "The explanation module wraps a hosted third-party LLM, used as-is."}]
COMPONENT = {"id": "component-abc", "cls": "AIComponent", "label": "Explanation service",
             "vair": "ApplicationPlatform", "provenance": "form", "fullText": None}
VIEW = in_a_row(COMPONENT)


def reply(obj):
    return lambda *a, **k: json.dumps(obj)


def test_a_quoted_finding_on_a_real_node_is_kept():
    notes, dropped = check(VIEW, ANSWERS, reply({"findings": [
        {"node": "component-abc", "why": "the answer says it wraps an LLM", "quote": "wraps a hosted third-party LLM"}]}))
    assert notes == {"component-abc": [{"why": "the answer says it wraps an LLM",
                                        "quote": "wraps a hosted third-party LLM", "of": "Explanation service"}]}
    assert dropped == []


def test_a_quote_not_in_the_answers_is_dropped():
    notes, dropped = check(VIEW, ANSWERS, reply({"findings": [{"node": "component-abc", "why": "w", "quote": "a fine-tuned model"}]}))
    assert notes == {} and dropped[0]["reason"] == "quote not in the answers"


def test_an_unknown_node_is_dropped():
    notes, dropped = check(VIEW, ANSWERS, reply({"findings": [{"node": "component-zzz", "why": "w", "quote": "hosted third-party LLM"}]}))
    assert notes == {} and dropped[0]["reason"] == "no such node"


def test_garbage_is_no_finding_and_no_crash():
    assert check(VIEW, ANSWERS, lambda *a, **k: "no json")[0] == {}


def test_at_most_eight_and_one_per_node():
    many = [{"node": "component-abc", "why": str(i), "quote": "hosted third-party LLM"} for i in range(12)]
    notes, dropped = check(VIEW, ANSWERS, reply({"findings": many}))
    assert len(notes["component-abc"]) == 1
    assert {d["reason"] for d in dropped} == {"one per node"}


def test_a_node_the_author_did_not_write_is_not_listed():
    view = in_a_row({**COMPONENT, "provenance": "agent"})
    notes, dropped = check(view, ANSWERS, reply({"findings": [
        {"node": "component-abc", "why": "w", "quote": "hosted third-party LLM"}]}))
    assert notes == {} and dropped == []


def test_a_long_answer_node_is_noted_against_its_full_text():
    full = "Assess the creditworthiness of consumer loan applicants for retail banks"
    view = in_a_row({"id": "purpose", "cls": "Purpose", "label": "Consumer loan creditworthiness",
                     "vair": None, "provenance": "form", "fullText": full}, prop="hasPurpose")
    notes, _ = check(view, ANSWERS, reply({"findings": [{"node": "purpose", "why": "w", "quote": "hosted   third-party LLM"}]}))
    assert notes["purpose"][0]["of"] == full and notes["purpose"][0]["quote"] == "hosted third-party LLM"


def test_no_listed_node_asks_nothing():
    calls = []
    assert check(in_a_row(), ANSWERS, lambda *a, **k: calls.append(1)) == ({}, []) and not calls


def test_the_real_card_view_lists_its_nodes_to_the_model():
    users = []
    check(MCAS_VIEW, ANSWERS, lambda s, u, **k: users.append(u) or "{}")
    assert users and "deployer | AIOperator |" in users[0] and "risk0_source | RiskSource |" in users[0]


def test_more_than_eight_findings_keep_eight():
    view = in_a_row(*({**COMPONENT, "id": f"component-{i}"} for i in range(10)))
    many = [{"node": f"component-{i}", "why": "w", "quote": "hosted third-party LLM"} for i in range(10)]
    notes, dropped = check(view, ANSWERS, reply({"findings": many}))
    assert len(notes) == 8 and [d["reason"] for d in dropped] == ["at most eight"] * 2


@pytest.mark.parametrize("odd", [["a"], {"id": "x"}, float("nan"), 3])
def test_a_node_that_is_not_an_id_is_dropped_as_text(odd):
    notes, dropped = check(VIEW, ANSWERS, reply({"findings": [{"node": odd, "why": "w", "quote": "hosted third-party LLM"}]}))
    assert notes == {} and dropped == [{"node": str(odd)[:80], "reason": "no such node"}]


def test_an_answer_without_an_annex_point_is_listed_without_a_bracket():
    _, user = consistency_prompt([COMPONENT], [{"annexPoint": None, "answer": "one"}, {"answer": "two"},
                                               {"annexPoint": "2a", "answer": "three"}])
    assert "[None]" not in user and "[]" not in user
    assert user.splitlines()[-3:] == ["one", "two", "[2a] three"]


CVIEW = {"view": VIEW}
QUOTE = "hosted third-party LLM"


def _run(complete, build):
    published = {}
    run_fill(QUALIFICATION, terms=TERMS, complete=complete,
             publish=lambda qid, payload: published.setdefault(qid, payload), build=build)
    return published["q1"]


def _completer(consistency):
    fake = FakeCompleter()

    def complete(system, user, temperature=0.0):
        if "Checking an AI card" in system:
            return consistency(system, user)
        if "Naming long answers" in system:
            return "{}"
        return fake(system, user, temperature)

    return complete


def test_the_payload_carries_techniques_names_and_notes():
    q = dict(QUALIFICATION, answers=[*QUALIFICATION["answers"], {"annexPoint": "2a", "answer": f"It wraps a {QUOTE}."}])
    published = {}
    complete = _completer(lambda s, u: json.dumps({"findings": [{"node": "component-abc", "why": "w", "quote": QUOTE}]}))
    run_fill(q, terms=TERMS, complete=complete, publish=lambda i, p: published.setdefault(i, p), build=lambda a, e: CVIEW)
    payload = published["q1"]
    assert payload["techniques"] and "names" in payload
    assert payload["notes"] == {"component-abc": [{"why": "w", "quote": QUOTE, "of": "Explanation service"}]}
    assert payload["record"]["notes"] == 1


def test_a_service_error_from_build_still_publishes_the_techniques():
    from fill.clients import ServiceError

    def down(q, e):
        raise ServiceError("unreachable")

    payload = _run(FakeCompleter(), down)
    assert payload["techniques"] and payload["notes"] == {}
    assert payload["record"]["notes"] == 0 and payload["record"]["notes_failed"]


def test_a_model_error_in_the_consistency_pass_still_publishes_techniques_and_names():
    def boom(s, u):
        raise TimeoutError("model timed out")

    payload = _run(_completer(boom), lambda q, e: CVIEW)
    assert payload["techniques"] and payload["names"] == {}
    assert payload["notes"] == {} and payload["record"]["notes"] == 0
    assert "timed out" in payload["record"]["notes_failed"]


def test_bad_json_from_the_consistency_pass_is_no_notes():
    payload = _run(_completer(lambda s, u: "no json"), lambda q, e: CVIEW)
    assert payload["techniques"] and payload["notes"] == {} and payload["record"]["notes"] == 0


@pytest.mark.parametrize("odd", [["a"], float("nan")])
def test_a_model_reply_with_an_odd_node_still_publishes_valid_json(odd):
    reply_ = lambda s, u: json.dumps({"findings": [{"node": odd, "why": "w", "quote": QUOTE}]})
    payload = _run(_completer(reply_), lambda q, e: CVIEW)
    json.dumps(payload, allow_nan=False)
    assert payload["record"]["notes_dropped"] == [{"node": str(odd), "reason": "no such node"}]
