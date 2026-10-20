"""Every node of a card view, as one list.

The view /build returns has no flat node list: it keeps the system, a row per property of
the system half, and a chain per risk whose slots (and areas) hold the rest. A node can sit
in several places (the users are a row and the stakeholder of a risk), so it is listed once.
"""
from __future__ import annotations

_CHAIN_SLOTS = ("risk", "source", "vulnerability", "consequence", "impact", "stakeholder", "control", "followUp")


def nodes_of(view: dict) -> list[dict]:
    """The view's nodes in card order, each id once."""
    found = [view.get("system")]
    for row in view.get("rows") or []:
        found += row.get("nodes") or []
    for chain in view.get("chains") or []:
        found += [chain.get(slot) for slot in _CHAIN_SLOTS]
        found += chain.get("areas") or []
    seen: dict[str, dict] = {}
    for node in found:
        if isinstance(node, dict) and node.get("id") and node["id"] not in seen:
            seen[node["id"]] = node
    return list(seen.values())
