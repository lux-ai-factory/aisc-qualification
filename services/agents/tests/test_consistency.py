"""Refine with AI points at choices the card's own answers contradict, and changes nothing."""
import json

from fill.consistency import check
from fill.workflow import run_fill
from tests.test_workflow import QUALIFICATION, TERMS, FakeCompleter

ANSWERS = [{"annexPoint": "2a", "answer": "The explanation module wraps a hosted third-party LLM, used as-is."}]
VIEW = {"nodes": [{"id": "component-abc", "cls": "AIComponent", "label": "Explanation service",
                   "vair": "ApplicationPlatform", "provenance": "form", "fullText": None}]}


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
    view = {"nodes": [{**VIEW["nodes"][0], "provenance": "agent"}]}
    notes, dropped = check(view, ANSWERS, reply({"findings": [
        {"node": "component-abc", "why": "w", "quote": "hosted third-party LLM"}]}))
    assert notes == {} and dropped == []


def test_a_long_answer_node_is_noted_against_its_full_text():
    full = "Assess the creditworthiness of consumer loan applicants for retail banks"
    view = {"nodes": [{"id": "purpose", "cls": "Purpose", "label": "Consumer loan creditworthiness",
                       "vair": None, "provenance": "form", "fullText": full}]}
    notes, _ = check(view, ANSWERS, reply({"findings": [{"node": "purpose", "why": "w", "quote": "hosted   third-party LLM"}]}))
    assert notes["purpose"][0]["of"] == full and notes["purpose"][0]["quote"] == "hosted third-party LLM"


def test_no_listed_node_asks_nothing():
    calls = []
    assert check({"nodes": []}, ANSWERS, lambda *a, **k: calls.append(1)) == ({}, []) and not calls


CVIEW = {"view": {"nodes": [VIEW["nodes"][0]]}}
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



def test_the_payload_carries_techniques_names_and_notes(monkeypatch):
    payload = None
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
