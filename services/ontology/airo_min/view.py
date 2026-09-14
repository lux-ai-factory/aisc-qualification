"""The view model the AI card renders.

Computed here rather than in the frontend, so the app needs no RDF library and the
ontology logic stays in one language. Mirrors AIRO's Figure 3: a system half of
property rows, and a risk half of one chain per risk.
"""
from typing import Any

from rdflib import Graph, RDF, RDFS, URIRef

from .build import QUAL
from .mapping import FORM_MAPPING
from .schema import AIRO, CLASSES
from .vair_terms import typeable_classes
from .vair_map import VAIR
from .pickers import PICKERS

# Areas of impact display in the form's own order, not alphabetically.
_AREA_ORDER = {e["id"]: i for i, e in enumerate(PICKERS["impactArea"])}


#: The classes VAIR subdivides, from the module that owns that question.
TYPEABLE_CLASSES = typeable_classes()

# Classes where VAIR has terms, but they describe one population rather than the
# class. All 17 AIOperator terms are Annex III public bodies: EU agencies,
# bodies, institutions and offices, public and judicial authorities and their
# agents, law enforcement and its agents, emergency services, educational and
# vocational training institutions. A commercial provider or a retail bank has
# no term to take, so it is complete without one. A public-body deployer can
# still be given its term; only the absence stops being a defect.
PARTIAL_VOCABULARIES = frozenset({"AIOperator"})

# The system half, in the order the card shows it.
SYSTEM_ROWS: list[tuple[str, str]] = [
    ("hasPurpose", "Purpose"),
    ("hasCapability", "Capabilities"),
    ("isAppliedWithinDomain", "Domain"),
    ("hasModality", "How it reaches the market"),
    ("isUsedWithinLocality", "Where it is used"),
    ("isProvidedBy", "Provider"),
    ("isDeployedBy", "Deployers"),
    ("hasAIUser", "Users and people affected"),
    ("usesTechnique", "Techniques"),
    ("hasComponent", "Components"),
]

# property -> the AI Act provision the form element cites, from mapping.py
_CITATIONS = {m.property: m.reference for m in FORM_MAPPING}


def _local(term: URIRef) -> str:
    return str(term).rsplit("#", 1)[-1]


def node_view(g: Graph, node: URIRef) -> dict[str, Any]:
    """One node, with everything the UI needs and nothing it does not."""
    airo_cls = next(
        (_local(o) for o in g.objects(node, RDF.type) if str(o).startswith(AIRO)), None
    )
    vair = next(
        (_local(o) for o in g.objects(node, RDF.type) if str(o).startswith(VAIR)), None
    )
    out = {
        "id": _local(node),
        "label": str(g.value(node, RDFS.label) or _local(node)),
        "cls": airo_cls,
        "vair": vair,
        "fullText": _opt(g, node, QUAL.fullLabel),
        "provenance": str(g.value(node, QUAL.provenance) or "form"),
    }
    if g.value(node, QUAL.termNotApplicable) is not None:
        # A reviewer determined the vocabulary has nothing that fits.
        out["termNotApplicable"] = True
    flags = [str(o) for o in g.objects(node, QUAL.reviewFlag)]
    if flags:
        # Sorted for a stable card, and because the order a set yields is not an
        # order. The builder writes them from a list; RDF does not keep it.
        out["flags"] = sorted(flags)
    if not _expects_a_term(airo_cls):
        # No term can describe this node: either VAIR does not subdivide the
        # class, or its terms name a population the node is not part of. Said
        # once here, so every reader agrees. The PDF in particular has no
        # vocabulary to consult and cannot infer it from an empty list.
        out["termExpected"] = False
    for key, prop in (
        ("generatedLabel", QUAL.generatedLabel),
        ("reviewNote", QUAL.reviewNote),
        ("formTag", QUAL.formTag),
        ("derivedFrom", QUAL.derivedFrom),
    ):
        value = _opt(g, node, prop)
        if value is not None:
            out[key] = value
    return out


def _opt(g: Graph, node: URIRef, prop: URIRef) -> str | None:
    value = g.value(node, prop)
    return str(value) if value is not None else None


def build_view(g: Graph) -> dict[str, Any]:
    """The whole card view for one filled graph."""
    system = next(g.subjects(RDF.type, URIRef(AIRO + "AISystem")))

    rows = []
    for prop, label in SYSTEM_ROWS:
        nodes = [node_view(g, o) for o in g.objects(system, URIRef(AIRO + prop))]
        if not nodes:
            continue
        rows.append(
            {
                "property": prop,
                "label": label,
                "citation": _CITATIONS.get(prop, ""),
                "nodes": sorted(nodes, key=lambda n: n["id"]),
            }
        )

    chains = [
        _chain(g, risk)
        for risk in sorted(
            g.objects(system, URIRef(AIRO + "hasRisk")), key=lambda r: _local(r)
        )
    ]

    named = {s for s in g.subjects() if isinstance(s, URIRef)}
    return {
        "system": node_view(g, system),
        "answers": _answers(g, system),
        "rows": rows,
        "chains": chains,
        "counts": {
            "nodes": len(named),
            "triples": len(g),
            "risks": len(chains),
            "reviewed": sum(
                1 for n in named if str(g.value(n, QUAL.provenance)) == "reviewed"
            ),
            "untyped": sum(1 for n in named if _untyped(g, n)),
            # flagged by the filler's own review and not yet settled
            "flagged": sum(
                1 for n in named if g.value(n, QUAL.reviewFlag) is not None
            ),
            # what a reviewer can act on: the class has terms that describe it,
            # none is assigned, and none has been marked as not applicable
            "needsTerm": sum(
                1
                for n in named
                if _untyped(g, n)
                and _expects_a_term(_airo_class(g, n))
                and g.value(n, QUAL.termNotApplicable) is None
            ),
            # nothing to act on: either VAIR does not subdivide this class, or
            # its terms name a population this node does not belong to
            "unclassifiable": sum(
                1
                for n in named
                if _untyped(g, n) and not _expects_a_term(_airo_class(g, n))
            ),
        },
    }


def _expects_a_term(cls: str | None) -> bool:
    """Whether a node of this class without a VAIR term is a gap."""
    return cls in TYPEABLE_CLASSES and cls not in PARTIAL_VOCABULARIES


def _untyped(g: Graph, node: URIRef) -> bool:
    return not any(str(o).startswith(VAIR) for o in g.objects(node, RDF.type))


def _airo_class(g: Graph, node: URIRef) -> str | None:
    return next(
        (_local(o) for o in g.objects(node, RDF.type) if str(o).startswith(AIRO)), None
    )


def _chain(g: Graph, risk: URIRef) -> dict[str, Any]:
    """One risk's full path: source and weakness, through to impact and controls."""
    source = next(g.subjects(URIRef(AIRO + "isRiskSourceFor"), risk), None)
    vulnerability = (
        next(g.objects(source, URIRef(AIRO + "exploitsVulnerability")), None)
        if source is not None
        else None
    )
    consequence = next(g.objects(risk, URIRef(AIRO + "hasConsequence")), None)
    impact = (
        next(g.objects(consequence, URIRef(AIRO + "hasImpact")), None)
        if consequence is not None
        else None
    )
    stakeholder = (
        next(g.objects(impact, URIRef(AIRO + "hasImpactOnStakeholder")), None)
        if impact is not None
        else None
    )
    areas = (
        sorted(
            g.objects(impact, URIRef(AIRO + "hasImpactOnArea")),
            key=lambda a: _AREA_ORDER.get(
                str(g.value(a, QUAL.formTag) or ""), len(_AREA_ORDER)
            ),
        )
        if impact is not None
        else []
    )
    control = next(g.subjects(URIRef(AIRO + "modifiesRiskConcept"), risk), None)
    follow_up = (
        next(g.objects(control, URIRef(AIRO + "isFollowedByControl")), None)
        if control is not None
        else None
    )

    def v(node):
        return node_view(g, node) if node is not None else None

    return {
        "risk": v(risk),
        "source": v(source),
        "vulnerability": v(vulnerability),
        "consequence": v(consequence),
        "impact": v(impact),
        "stakeholder": v(stakeholder),
        "areas": [node_view(g, a) for a in areas],
        "control": v(control),
        "followUp": v(follow_up),
        "citation": "Art 9(2); Annex IV 5",
    }


def _answers(g: Graph, system: URIRef) -> list[dict[str, str]]:
    """The Annex IV answers riding along with the graph, in citation order."""
    out = []
    for node in g.objects(system, QUAL.answer):
        out.append(
            {
                "citation": str(g.value(node, QUAL.citation) or ""),
                "questionId": str(g.value(node, QUAL.questionId) or ""),
                "text": str(g.value(node, QUAL.text) or ""),
            }
        )
    return sorted(out, key=lambda a: a["questionId"])
