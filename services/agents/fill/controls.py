"""The deterministic checks a draft has to survive before the critic sees it.

They are cheap, they need no model, and they catch the failures a language model
makes most often: a term that belongs to another class, a sentence where a name
belongs, a node nothing in the answer supports, and one node per noun phrase.

Each returns `Finding`s carrying a flag from the builder's closed set, so
anything raised here can be published onto the graph as-is.
"""
from __future__ import annotations

import re

from .models import CAP, Draft, Finding, Node

LABEL_MAX = 60

#: Words too common to count as evidence that a label came from the answer.
_STOPWORDS = frozenset(
    """a an and are as at be by for from has have in into is it its of on or over
    that the their them then there these this to used uses using with within""".split()
)

#: A label that opens with one of these is describing, not naming.
_VERB_OPENERS = frozenset(
    """the this a an it we our system agent model uses use used using is are was
    were has have had provides provide performs perform applies apply""".split()
)


def _stem(word: str) -> str:
    """Crude suffix stripping, so "boosting" matches "boosted".

    Not linguistics: enough that a label taken from the answer in a different
    inflection still counts as taken from the answer. A real stemmer would be a
    dependency and a source of surprises for two dozen words a form ever uses.
    """
    for suffix in ("ising", "izing", "ing", "edly", "ed", "es", "s"):
        if len(word) - len(suffix) >= 4 and word.endswith(suffix):
            return word[: -len(suffix)]
    return word


def _words(text: str) -> set[str]:
    return {
        _stem(w)
        for w in re.findall(r"[a-z0-9]+", text.lower())
        if len(w) > 2 and w not in _STOPWORDS
    }


def run_controls(draft: Draft, source: str, terms: list[str]) -> list[Finding]:
    """Every deterministic finding against one property's draft, in order."""
    findings: list[Finding] = []
    findings += _coverage(draft, source)
    findings += _terms(draft, terms)
    findings += _labels(draft)
    findings += _grounding(draft, source)
    findings += _inflation(draft)
    return findings


def _coverage(draft: Draft, source: str) -> list[Finding]:
    """An answer with content and no nodes drafted from it."""
    if draft.nodes or not _words(source):
        return []
    return [
        Finding(
            node_id=draft.prop,
            flag="uncovered",
            detail=(
                f"the {draft.prop} answer has content but nothing was proposed "
                "from it"
            ),
        )
    ]


def _terms(draft: Draft, terms: list[str]) -> list[Finding]:
    """A term VAIR does not define for this node's class.

    The builder refuses these outright, so a draft carrying one cannot be
    written. Caught here to keep the failure inside the loop, where the writer
    can be told what it did.
    """
    allowed = set(terms)
    return [
        Finding(
            node_id=node.id,
            flag="unsupported-term",
            detail=(
                f"{node.vair!r} is not a VAIR term for {node.cls or 'this class'}"
            ),
        )
        for node in draft.nodes
        if node.vair and node.vair not in allowed
    ]


def _labels(draft: Draft) -> list[Finding]:
    """A label is a name: short, no closing punctuation, not a clause."""
    findings = []
    for node in draft.nodes:
        label = node.label.strip()
        first = re.split(r"[^A-Za-z]+", label.lower(), maxsplit=1)[0]
        reason = None
        if len(label) > LABEL_MAX:
            reason = f"{len(label)} characters; a name fits in {LABEL_MAX}"
        elif label.endswith((".", ";", "!", "?")):
            reason = "ends in punctuation, so it is a sentence"
        elif first in _VERB_OPENERS:
            reason = f"opens with {first!r}, so it describes rather than names"
        if reason:
            findings.append(
                Finding(node_id=node.id, flag="sentence", detail=reason)
            )
    return findings


def _grounding(draft: Draft, source: str) -> list[Finding]:
    """A label whose content words are not in the answer it claims to come from.

    Two words have to match, not one: a single shared word is a coincidence.

    This catches invention, not recombination. A label built from words that are
    all in the answer but mean something else there ("policy gradient" from a
    sentence about policy documents and gradient boosting) passes here and is
    the critic's job: no string comparison can tell those apart.
    """
    available = _words(source)
    if not available:
        return []
    findings = []
    for node in draft.nodes:
        label_words = _words(node.label)
        overlap = label_words & available
        if len(overlap) < min(2, len(label_words)):
            findings.append(
                Finding(
                    node_id=node.id,
                    flag="ungrounded",
                    detail=(
                        f"{node.label!r} does not appear in the answer "
                        f"({len(overlap)} of {len(label_words)} words match)"
                    ),
                )
            )
    return findings


def _inflation(draft: Draft) -> list[Finding]:
    """More nodes than the property warrants, or two nodes carrying one term.

    The surplus is flagged rather than the draft, so the writer is told which
    node to drop, and a person clearing it knows which one to look at.
    """
    findings = []
    cap = CAP.get(draft.prop, len(draft.nodes))
    seen: dict[str, Node] = {}
    for position, node in enumerate(draft.nodes):
        if node.vair and node.vair in seen:
            findings.append(
                Finding(
                    node_id=node.id,
                    flag="inflated",
                    detail=(
                        f"same VAIR term as {seen[node.vair].id}"
                        f" ({node.vair}); they are one node"
                    ),
                )
            )
            continue
        if node.vair:
            seen[node.vair] = node
        if position >= cap:
            findings.append(
                Finding(
                    node_id=node.id,
                    flag="inflated",
                    detail=f"node {position + 1} of a property that takes {cap}",
                )
            )
    return findings
