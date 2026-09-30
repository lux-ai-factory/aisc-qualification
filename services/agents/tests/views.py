"""Card views in the shape /build returns them.

MCAS_VIEW is the builder's own view of the MCAS example (the ontology suite fails when it goes
stale). `in_a_row` wraps a few nodes in that same shape, for tests that need other nodes.
"""
import json
from pathlib import Path

MCAS_VIEW = json.loads((Path(__file__).parent / "fixtures" / "mcas.view.json").read_text(encoding="utf-8"))


def in_a_row(*nodes: dict, prop: str = "hasComponent") -> dict:
    """A view whose only nodes are `nodes`, in one row as build_view lays them out."""
    return {"system": None, "answers": [], "chains": [],
            "rows": [{"property": prop, "label": prop, "citation": "", "nodes": list(nodes)}]}
