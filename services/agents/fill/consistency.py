"""One pass that compares the author's card choices with their own answers and only points.

A finding names a node, says why in a sentence and quotes the answer it rests on. It is kept only
when the node is one the author chose and the quote is in the answers word for word, so a finding
the model could not ground never reaches the card. Nothing here changes a node.
"""
from __future__ import annotations

from typing import Callable

from .agents import _json_object
from .prompts import consistency_prompt
from .view_nodes import nodes_of

MAX_NOTES = 8

CHECKED = {
    "AISystem", "Purpose", "AICapability", "Domain", "Modality", "LocalityOfUse", "AIComponent",
    "AIModel", "Data", "AIOperator", "AISubject", "RiskSource", "Consequence", "Impact",
    "RiskControl", "AreaOfImpact",
}


def _squash(text: str) -> str:
    return " ".join(text.split())


def check(view: dict, answers: list[dict], complete: Callable[..., str]) -> tuple[dict[str, list[dict]], list[dict]]:
    """Notes as `{node id: [{"why", "quote", "of"}]}`, and the findings that were dropped with a reason."""
    nodes = {
        n["id"]: n
        for n in nodes_of(view)
        if n.get("provenance") == "form" and n.get("cls") in CHECKED
    }
    texts = [_squash(a["answer"]) for a in answers if isinstance(a.get("answer"), str) and a["answer"].strip()]
    if not nodes or not texts:
        return {}, []
    system, user = consistency_prompt(list(nodes.values()), answers)
    raw = _json_object(complete(system, user)).get("findings")
    notes: dict[str, list[dict]] = {}
    dropped: list[dict] = []
    for finding in raw if isinstance(raw, list) else []:
        if not isinstance(finding, dict):
            continue
        node_id, why, quote = finding.get("node"), finding.get("why"), finding.get("quote")
        quote = _squash(quote) if isinstance(quote, str) else ""
        reason = None
        if not isinstance(node_id, str):
            # a list is unhashable and a NaN is no JSON: the record keeps it as text
            node_id, reason = str(node_id)[:80], "no such node"
        elif node_id not in nodes:
            reason = "no such node"
        elif not (quote and isinstance(why, str) and why.strip() and any(quote in t for t in texts)):
            reason = "quote not in the answers"
        elif node_id in notes:
            reason = "one per node"
        elif len(notes) >= MAX_NOTES:
            reason = "at most eight"
        if reason:
            dropped.append({"node": node_id, "reason": reason})
            continue
        node = nodes[node_id]
        notes[node_id] = [{"why": _squash(why), "quote": quote, "of": node.get("fullText") or node["label"]}]
    return notes, dropped
