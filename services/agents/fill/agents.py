"""The two LLM participants: the writer that drafts, the critic that reviews.

Both are thin. The loop decides what happens; these two turn a prompt into a
value the loop can use, and absorb everything a model does that is not JSON.
Nothing here raises on a bad answer: an unparseable draft becomes an empty
draft, which the coverage control reports as a finding the writer can act on. A
crash would publish nothing, and always publishing something is the design.
"""
from __future__ import annotations

import json
import re
from typing import Callable, Sequence

from .models import CLASS_OF, Draft, Finding, Node, Property
from .prompts import critic_prompt, writer_prompt

#: Flags the builder accepts. Duplicated as a literal rather than imported from
#: the ontology package: this service talks to that one over HTTP and does not
#: depend on its code. tests/test_controls.py asserts the two agree.
PUBLISHABLE_FLAGS = frozenset(
    {"ungrounded", "inflated", "sentence", "unsupported-term", "uncovered"}
)

#: Node id prefixes the builder expects, keyed by property.
_PREFIX: dict[str, str] = {
    "techniques": "technique",
    "components": "component",
    "risk_types": "risk",
}

Completer = Callable[..., str]


def _json_object(text: str) -> dict:
    """The first JSON object in a model's answer, or an empty one.

    Models fence their JSON, introduce it, and apologise after it. All three are
    fine; anything else yields {} and is handled as an empty result.
    """
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    candidate = fenced.group(1) if fenced else None
    if candidate is None:
        start = text.find("{")
        end = text.rfind("}")
        candidate = text[start : end + 1] if 0 <= start < end else None
    if not candidate:
        return {}
    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def parse_nodes(text: str, prop: Property) -> list[Node]:
    """A model's answer as nodes, with positional ids so findings can name them."""
    raw = _json_object(text).get("nodes")
    if not isinstance(raw, list):
        return []
    prefix = _PREFIX.get(prop, prop)
    nodes: list[Node] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        label = entry.get("label")
        if not isinstance(label, str) or not label.strip():
            continue
        term = entry.get("vair")
        nodes.append(
            Node(
                id=f"{prefix}{len(nodes)}",
                label=" ".join(label.split()),
                vair=term if isinstance(term, str) and term else None,
                cls=CLASS_OF.get(prop, ""),
            )
        )
    return nodes


def parse_findings(text: str) -> list[Finding]:
    """A critic's answer as findings, dropping any flag the graph cannot carry."""
    raw = _json_object(text).get("findings")
    if not isinstance(raw, list):
        return []
    findings = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        flag = entry.get("flag")
        node = entry.get("node")
        if flag not in PUBLISHABLE_FLAGS or not isinstance(node, str):
            continue
        findings.append(
            Finding(
                node_id=node,
                flag=flag,
                detail=str(entry.get("why") or "").strip() or "no reason given",
                source="critic",
            )
        )
    return findings


class LlmWriter:
    """Drafts a property's nodes, and redrafts the ones a review named."""

    def __init__(self, complete: Completer):
        self._complete = complete

    def draft(
        self,
        prop: Property,
        source: str,
        terms: list[str],
        findings: Sequence[Finding] = (),
    ) -> Draft:
        system, user = writer_prompt(prop, source, terms, findings)
        return Draft(prop=prop, nodes=tuple(parse_nodes(self._complete(system, user), prop)))


class LlmCritic:
    """Reviews a draft against the answer it came from, and nothing else."""

    def __init__(self, complete: Completer):
        self._complete = complete

    def review(self, draft: Draft, source: str) -> list[Finding]:
        system, user = critic_prompt(draft, source)
        return parse_findings(self._complete(system, user))
