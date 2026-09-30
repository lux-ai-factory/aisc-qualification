"""Short names for the long answers on the card.

The author's text is never touched: a name is drafted next to it, carries the text it was
written for, and the builder applies it only while the text still reads the same. A name is
held to the label rules the drafts are (short, a noun phrase, from the answer's own words),
and one that fails them twice is not published rather than published flagged.
"""
from __future__ import annotations

from typing import Callable

from .agents import _json_object
from .controls import _grounding, _labels
from .models import Draft, Finding, Node
from .prompts import naming_prompt

#: Classes whose nodes the drafting of techniques and components already names.
_DRAFTED_CLASSES = {"AITechnique", "AIComponent"}


def nameable(view: dict) -> dict[str, str]:
    """Node id to the full text of every node the author wrote whose label had to be cut."""
    return {
        node["id"]: node["fullText"]
        for node in view.get("nodes", [])
        if node.get("fullText")
        and node.get("provenance") == "form"
        and node.get("cls") not in _DRAFTED_CLASSES
    }


def _check(texts: dict[str, str], proposed: dict) -> tuple[dict[str, str], list[Finding]]:
    """Split proposed names into the ones that pass the label controls and the findings on the rest."""
    kept: dict[str, str] = {}
    findings: list[Finding] = []
    for node_id, text in texts.items():
        name = proposed.get(node_id)
        if not isinstance(name, str) or not name.strip():
            findings.append(Finding(node_id, "uncovered", "no name was given"))
            continue
        name = " ".join(name.split())
        draft = Draft(prop="techniques", nodes=(Node(id=node_id, label=name),))
        problems = _labels(draft) + _grounding(draft, text)
        if problems:
            findings += problems
        else:
            kept[node_id] = name
    return kept, findings


def draft_names(
    texts: dict[str, str], complete: Callable[..., str], max_rounds: int = 3
) -> tuple[dict[str, dict], list[dict]]:
    """Names for `texts` as `{id: {"name", "of"}}`, and the entries given up on.

    Only the names that failed a check are asked for again, with what the check said.
    """
    names: dict[str, dict] = {}
    pending = dict(texts)
    findings: list[Finding] = []
    for _ in range(max_rounds):
        if not pending:
            break
        system, user = naming_prompt(pending, findings)
        kept, findings = _check(pending, _json_object(complete(system, user)))
        names.update({i: {"name": n, "of": texts[i]} for i, n in kept.items()})
        pending = {i: t for i, t in pending.items() if i not in kept}
    reasons: dict[str, str] = {}
    for f in findings:
        if f.node_id in pending:
            reasons.setdefault(f.node_id, f.detail)
    return names, [{"node": node, "reason": reason} for node, reason in reasons.items()]
