"""What the filler workflow passes between its states.

Plain dataclasses rather than pydantic: these cross no network boundary on their
own (the HTTP shapes live in `clients.py`), and the loop is easier to test when a
proposal is a value you can construct in one line.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

#: The properties this workflow fills. Each is a slot in the builder's
#: `extracted` payload, and each comes from one Annex IV sub-item.
Property = Literal["techniques", "components", "risk_types"]

PROPERTIES: tuple[Property, ...] = ("techniques", "components", "risk_types")

#: The AIRO class each property's nodes take, which decides the term list.
CLASS_OF: dict[Property, str] = {
    "techniques": "AITechnique",
    "components": "AIComponent",
    "risk_types": "",  # per node: a risk chain spans several classes
}

#: Which Annex IV answer a property is drafted from, for grounding.
CITATION_OF: dict[Property, str] = {
    "techniques": "Annex IV(2)(a)",
    "components": "Annex IV(2)(c)",
    "risk_types": "",  # the risk rows, not an Annex IV answer
}

#: How many nodes a property may carry before the draft counts as inflated.
#: The vocabulary is large; an answer is not. See prompts/filling-the-airo-ontology.md.
CAP: dict[Property, int] = {"techniques": 3, "components": 4, "risk_types": 40}


@dataclass(frozen=True)
class Node:
    """One proposed node: a name, and the VAIR term that types it."""

    id: str
    label: str
    vair: str | None = None
    #: The AIRO class this node takes. Needed to check the term belongs to it.
    cls: str = ""

    def with_label(self, label: str) -> "Node":
        return Node(id=self.id, label=label, vair=self.vair, cls=self.cls)


@dataclass(frozen=True)
class Finding:
    """One thing wrong with one node, raised by a control or by the critic."""

    node_id: str
    #: One of build.REVIEW_FLAGS, so a published finding is renderable.
    flag: str
    #: Why, in a sentence a person can act on.
    detail: str
    #: "control" for a deterministic check, "critic" for the reviewing LLM.
    source: Literal["control", "critic"] = "control"

    def __str__(self) -> str:
        return f"{self.node_id}: {self.flag} ({self.detail})"


@dataclass(frozen=True)
class Draft:
    """A property's nodes as currently proposed."""

    prop: Property
    nodes: tuple[Node, ...] = ()

    def merge(self, nodes: tuple[Node, ...]) -> "Draft":
        """This draft with a revision applied: matching ids swapped, new ones added.

        Adding matters: `uncovered` is the finding whose remedy is a node that
        is not there yet, so a revision that could only replace could never
        answer it.
        """
        fresh = {n.id: n for n in nodes}
        kept = tuple(fresh.pop(n.id, n) for n in self.nodes)
        return Draft(prop=self.prop, nodes=kept + tuple(fresh.values()))


@dataclass
class Round:
    """What one review round did, for the record the user reads."""

    number: int
    findings: tuple[Finding, ...]
    revised: tuple[str, ...] = ()
    calls: int = 0


@dataclass
class Outcome:
    """Where a property's loop ended, and why."""

    prop: Property
    draft: Draft
    rounds: list[Round] = field(default_factory=list)
    #: Which stopping rule fired. Every one of them publishes.
    stop: Literal["clean", "fixpoint", "cap", "budget"] = "clean"

    @property
    def open_findings(self) -> tuple[Finding, ...]:
        return self.rounds[-1].findings if self.rounds else ()

    @property
    def calls(self) -> int:
        return sum(r.calls for r in self.rounds)
