"""Human corrections to a generated graph, applied as a patch.

The generated graph is never overwritten in place: a patched node keeps its
generated label as `qual:generatedLabel` and is stamped `qual:provenance
"reviewed"`, so the card can always say which claims a person stands behind.

A patch is `{node_id: {"label"?, "vair"?, "note"?, "termNotApplicable"?}}` where
node_id is the node's local name (`purpose`, `risk0_control`, `capability1`).
Setting `vair` to None removes the VAIR type; a term VAIR does not define is
refused. The AIRO class cannot be patched: that is what a rebuild is for.

`termNotApplicable` records that a reviewer looked and found nothing in the
vocabulary that fits. VAIR's 17 AIOperator terms, for instance, are all Annex III
public bodies, so a commercial provider has no term to take; without this the
node would stay flagged as needing something that cannot exist.
"""
from typing import Any

from rdflib import Graph, Literal, RDF, RDFS, URIRef

from .build import QUAL, VAIR_TERMS
from .vair_map import VAIR
from .vair_terms import is_term_for

from .schema import AIRO as AIRO_NS

_ALLOWED = {"label", "vair", "note", "termNotApplicable"}


def apply_patch(g: Graph, patch: dict[str, dict[str, Any]] | None) -> None:
    """Apply human corrections to `g` in place."""
    if not patch:
        return
    for node_id, change in patch.items():
        unknown = set(change) - _ALLOWED
        if unknown:
            raise ValueError(
                f"cannot patch {', '.join(sorted(unknown))}: only "
                f"{', '.join(sorted(_ALLOWED))} may be changed "
                "(the AIRO class comes from a rebuild)"
            )
        node = _find(g, node_id)
        if node is None:
            continue  # a stale patch entry, e.g. after the form changed

        if "label" in change:
            generated = g.value(node, RDFS.label)
            if generated is not None and g.value(node, QUAL.generatedLabel) is None:
                g.add((node, QUAL.generatedLabel, generated))
            g.remove((node, RDFS.label, None))
            g.add((node, RDFS.label, Literal(change["label"])))

        if "vair" in change:
            for existing in list(g.objects(node, RDF.type)):
                if str(existing).startswith(VAIR):
                    g.remove((node, RDF.type, existing))
            term = change["vair"]
            if term is not None:
                # The same rule as the builder: a term has to belong to this
                # node's class. A reviewer picks from a list that is already
                # filtered, so this catches a stale or hand-made patch.
                cls = next(
                    (
                        str(o).rsplit("#", 1)[-1]
                        for o in g.objects(node, RDF.type)
                        if str(o).startswith(AIRO_NS)
                    ),
                    None,
                )
                if not is_term_for(cls, term):
                    if term in VAIR_TERMS:
                        raise ValueError(
                            f"{term!r} is not a term VAIR defines for {cls}; "
                            "it belongs to another class or to none"
                        )
                    raise ValueError(f"{term!r} is not a term VAIR defines")
                g.add((node, RDF.type, URIRef(VAIR + term)))
                # A real term settles the question, so the mark goes.
                g.remove((node, QUAL.termNotApplicable, None))

        if "termNotApplicable" in change:
            g.remove((node, QUAL.termNotApplicable, None))
            if change["termNotApplicable"]:
                g.add((node, QUAL.termNotApplicable, Literal(True)))

        if change.get("note"):
            g.remove((node, QUAL.reviewNote, None))
            g.add((node, QUAL.reviewNote, Literal(change["note"])))

        # A person has looked at this node, so its flags are settled.
        g.remove((node, QUAL.reviewFlag, None))

        g.remove((node, QUAL.provenance, None))
        g.add((node, QUAL.provenance, Literal("reviewed")))


def _find(g: Graph, node_id: str) -> URIRef | None:
    for subject in set(g.subjects()):
        if isinstance(subject, URIRef) and str(subject).rsplit("#", 1)[-1] == node_id:
            return subject
    return None
