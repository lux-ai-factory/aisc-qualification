"""Turn a saved qualification into a filled AIRO 3.1 graph.

Two kinds of input, kept apart on purpose:

  * Structured form fields (tags, pickers, risk rows) map deterministically onto
    AIRO properties. No judgment, no model.
  * Two properties live inside prose: `usesTechnique` in answer 2(a) and
    `hasComponent` in 2(c). They come from the `extracted` argument, which is the
    slot an agent's output fills. Without it they are absent rather than invented.

The Annex IV answers themselves are preserved verbatim as annotations in our own
namespace (`qual:`), attached to the AISystem with their Annex IV citation. That
keeps the AIRO structure at exactly the 19 properties of the minimal schema while
the graph still carries 100% of the technical documentation.
"""
from typing import Any, Iterable

from rdflib import BNode, Graph, Literal, Namespace, RDF, RDFS, URIRef

from .graph import add_individual, link, new_graph
from .schema import AIRO, SCHEMA_VERSION
from .vair_map import VAIR, vair_capability, vair_sector
from .vair_terms import every_vair_term, is_term_for
from .pickers import PICKERS

# Our own vocabulary, for what AIRO does not model: the source answers and their
# citations. Never mixed into the airo: namespace.
QUAL = Namespace("https://lux-ai-factory.github.io/qualification/ns#")

_AFFECTED_CLASS = {"operator": "isProvidedBy", "user": "hasAIUser"}

# A node label is a name, not a sentence: see
# prompts/filling-the-airo-ontology.md. Anything longer is shortened at a word
# boundary and the full text is kept on the same node as qual:text, so nothing is lost.
LABEL_MAX = 60


#: Kept for callers that only need "does VAIR name this at all"; use
#: vair_terms.is_term_for to decide whether a term fits a particular node.
VAIR_TERMS = every_vair_term()


def _typed(g: Graph, node: URIRef, term: str | None) -> None:
    """Add a VAIR type, refusing anything that is not a term for this node's class.

    Membership of the VAIR namespace is not enough. vair:Police is a real term
    and a nonsense type for a Purpose node, and 101 of VAIR's names hang off no
    class at all, so nothing should ever be typed with them. The class comes from
    the node itself, which already carries its airo:* type by this point.
    """
    if not term:
        return
    cls = _airo_class(g, node)
    if not is_term_for(cls, term):
        if term in VAIR_TERMS:
            raise ValueError(
                f"{term!r} is not a term VAIR defines for {cls}; "
                f"it belongs to another class or to none"
            )
        raise ValueError(f"{term!r} is not a term VAIR defines")
    g.add((node, RDF.type, URIRef(VAIR + term)))


def _airo_class(g: Graph, node: URIRef) -> str | None:
    return next(
        (
            str(o)[len(AIRO) :]
            for o in g.objects(node, RDF.type)
            if str(o).startswith(AIRO)
        ),
        None,
    )


def shorten(text: str) -> str:
    """Trim to a name of at most LABEL_MAX characters, cutting at a word boundary."""
    text = " ".join(text.split())
    if len(text) <= LABEL_MAX:
        return text
    cut = text[: LABEL_MAX - 3]
    if " " in cut:
        cut = cut[: cut.rindex(" ")]
    return cut.rstrip(" ,;:.") + "..."


def named(
    g: Graph, iri: URIRef, cls: str, text: str, name: str | None = None
) -> URIRef:
    """add_individual with the label rule applied: short name, full text alongside.

    `name` is a curated noun phrase from the `extracted` slot. Truncation is only the
    fallback: a cut sentence satisfies the length rule but is not a name.
    """
    text = " ".join(text.split())
    if name:
        node = add_individual(g, iri, cls, shorten(name))
        if text != name:
            g.add((node, QUAL.fullLabel, Literal(text)))
        _provenance(g, node, "form")
        return node
    node = add_individual(g, iri, cls, shorten(text))
    if len(text) > LABEL_MAX:
        # qual:fullLabel, not qual:text: the latter means "the Annex IV answer".
        g.add((node, QUAL.fullLabel, Literal(text)))
    _provenance(g, node, "form")
    return node


#: What a filler agent may say about its own draft. A closed set, so a flag is
#: something the card knows how to render and a person knows how to clear.
#:   ungrounded       the label's words are not in the answer it cites
#:   inflated         more nodes than the property warrants
#:   sentence         the label is a clause, not a name
#:   unsupported-term the term was chosen where the answer says nothing about it
#:   uncovered        the answer supports this property but nothing was proposed
REVIEW_FLAGS = frozenset(
    {"ungrounded", "inflated", "sentence", "unsupported-term", "uncovered"}
)


def _provenance(g: Graph, node: URIRef, source: str) -> None:
    """Where this node's content came from: a form field, or a prose extraction."""
    g.remove((node, QUAL.provenance, None))
    g.add((node, QUAL.provenance, Literal(source)))


def _vocab_entry(group: str, id_: str) -> dict | None:
    for entry in PICKERS[group]:
        if entry["id"] == id_:
            return entry
    return None


def _build_stamp() -> list[str]:
    """What produced this graph: the vendored ontologies, and this package.

    A file kept for the record has to name the definitions it was built against.
    Digests rather than version strings, because a version string is a claim and
    a digest is a fact; the two .ttl files are vendored unmodified, so their
    digests identify the published releases exactly.
    """
    import hashlib

    from pathlib import Path

    root = Path(__file__).resolve().parents[1] / "airo"
    stamps = [f"airo_min:{SCHEMA_VERSION}"]
    for name in ("airo.ttl", "vair.ttl"):
        digest = hashlib.sha256((root / name).read_bytes()).hexdigest()
        stamps.append(f"{name}:sha256:{digest}")
    return stamps


def build_graph(
    qualification: dict[str, Any],
    extracted: dict[str, Iterable[str]] | None = None,
    base: str | None = None,
) -> Graph:
    """Build the AIRO graph for one qualification.

    `qualification` is the export shape produced by scripts/export_qualification.mjs:
    metadata, resolved `targetSystems` / `sectors` labels, picker ids, `answers`
    and `risks`.
    `extracted` may carry {"techniques": [...], "components": [...]}.
    """
    extracted = extracted or {}
    # Curated noun-phrase names for the prose-fed nodes, keyed by node local name
    # ("purpose", "users", "risk0_control", ...). Truncation is the fallback.
    names: dict[str, str] = dict(extracted.get("names") or {})
    qid = qualification.get("id", "unsaved")
    g, ex = new_graph(base or f"https://lux-ai-factory.github.io/qualification/q/{qid}#")
    g.bind("qual", QUAL)

    system = named(
        g,
        ex.system,
        "AISystem",
        f"{qualification['systemName']} {qualification['systemVersion']}".strip(),
    )
    g.add((system, QUAL.qualificationId, Literal(qid)))
    g.add((system, QUAL.description, Literal(qualification["description"])))

    # ── capabilities: our tag, plus its VAIR type where one exists ───────────
    for i, ts in enumerate(qualification.get("targetSystems", [])):
        pair = f"{ts['category']} / {ts['subcategory']}"
        # The subcategory is the name; the pair is context, kept as fullLabel.
        node = named(
            g,
            ex[f"capability{i}"],
            "AICapability",
            pair,
            ts["subcategory"] if len(pair) > LABEL_MAX else None,
        )
        g.add((node, QUAL.formTag, Literal(ts["tag"])))
        vair = vair_capability(ts["tag"])
        if vair:
            g.add((node, RDF.type, URIRef(vair)))
        link(g, system, "hasCapability", node)

    # ── domains ──────────────────────────────────────────────────────────────
    for i, sector in enumerate(qualification.get("sectors", [])):
        node = named(g, ex[f"domain{i}"], "Domain", sector["name"])
        g.add((node, QUAL.formTag, Literal(sector["id"])))
        vair = vair_sector(sector["id"])
        if vair:
            g.add((node, RDF.type, URIRef(vair)))
        link(g, system, "isAppliedWithinDomain", node)

    # ── pickers whose ids are already VAIR terms ─────────────────────────────
    for group, prop, cls, prefix in (
        ("marketForm", "hasModality", "Modality", "modality"),
        ("locality", "isUsedWithinLocality", "LocalityOfUse", "locality"),
    ):
        for i, id_ in enumerate(qualification.get(f"{group}Tags", [])):
            entry = _vocab_entry(group, id_)
            if entry is None:
                raise ValueError(f"unknown {group} id: {id_}")
            node = named(g, ex[f"{prefix}{i}"], cls, entry["label"])
            g.add((node, QUAL.formTag, Literal(id_)))
            if entry.get("vair"):
                g.add((node, RDF.type, URIRef(f"https://w3id.org/vair#{entry['vair']}")))
            link(g, system, prop, node)

    # ── purpose, operators, users ────────────────────────────────────────────
    link(
        g,
        system,
        "hasPurpose",
        named(g, ex.purpose, "Purpose", qualification["targetUseCase"], names.get("purpose")),
    )
    link(
        g,
        system,
        "isProvidedBy",
        named(g, ex.provider, "AIOperator", qualification["company"], names.get("provider")),
    )
    if qualification.get("intendedDeployers"):
        link(
            g,
            system,
            "isDeployedBy",
            named(
                g,
                ex.deployer,
                "AIOperator",
                qualification["intendedDeployers"],
                names.get("deployer"),
            ),
        )
    link(
        g,
        system,
        "hasAIUser",
        named(g, ex.users, "AIUser", qualification["targetUsers"], names.get("users")),
    )

    # ── prose-derived, supplied by an agent ──────────────────────────────────
    for prop, key, cls, prefix, citation in (
        ("usesTechnique", "techniques", "AITechnique", "technique", "Annex IV(2)(a)"),
        ("hasComponent", "components", "AIComponent", "component", "Annex IV(2)(c)"),
    ):
        for i, entry in enumerate(extracted.get(key, [])):
            # The drafting prompt asks for {"label": ..., "vair": ...}; a plain string is
            # accepted so earlier extractions keep working.
            label = entry["label"] if isinstance(entry, dict) else entry
            term = entry.get("vair") if isinstance(entry, dict) else None
            node = named(g, ex[f"{prefix}{i}"], cls, label)
            _typed(g, node, term)
            _provenance(g, node, "extracted")
            g.add((node, QUAL.derivedFrom, Literal(citation)))
            link(g, system, prop, node)

    # ── risk rows: one full chain each ───────────────────────────────────────
    # AreaOfImpact nodes are shared across risks, exactly as the stakeholder
    # nodes are: "Fundamental rights" is one concept however many risks cite it.
    areas: dict[str, URIRef] = {}
    for row in qualification.get("risks", []):
        _add_risk(g, ex, system, row, areas, names)

    # ── VAIR terms for nodes no mapping can reach ────────────────────────────
    # The risk half has terms available but the choice depends on the row's text,
    # so it arrives through `extracted`, the same slot the agent fills. Applied
    # last, once every node exists.
    for node_id, term in (extracted.get("types") or {}).items():
        node = ex[node_id]
        if (node, RDF.type, None) not in g:
            continue  # a stale entry, e.g. after the form changed
        _typed(g, node, term)

    # ── the draft's own review findings ──────────────────────────────────────
    # The filler agent reviews its draft before anyone sees it and publishes
    # whatever it could not settle. A flag rides on the node, next to its
    # provenance, because that is where the person clearing it is looking.
    for node_id, flags in (extracted.get("flags") or {}).items():
        node = ex[node_id]
        if (node, RDF.type, None) not in g:
            continue  # a stale entry, e.g. after the form changed
        for flag in flags:
            if flag not in REVIEW_FLAGS:
                raise ValueError(
                    f"{flag!r} is not a review flag; expected one of "
                    f"{', '.join(sorted(REVIEW_FLAGS))}"
                )
            g.add((node, QUAL.reviewFlag, Literal(flag)))

    # ── what built this graph, so an exported file can be checked ────────────
    for stamp in _build_stamp():
        g.add((system, QUAL.builtWith, Literal(stamp)))

    # ── the Annex IV answers, verbatim ───────────────────────────────────────
    for answer in qualification.get("answers", []):
        node = BNode()
        g.add((system, QUAL.answer, node))
        g.add((node, QUAL.citation, Literal(_annex_citation(answer))))
        g.add((node, QUAL.questionId, Literal(f"{answer['toolId']}:{answer['questionId']}")))
        g.add((node, QUAL.text, Literal(answer["answer"])))

    return g


def _annex_citation(answer: dict[str, Any]) -> str:
    """Citation for a stored answer. Uses the one exported with it when present,
    otherwise rebuilds it from the id (`2d` -> Annex IV(2)(d), `1de` -> (1)(d)-(e))."""
    if answer.get("citation"):
        return str(answer["citation"])
    qid = str(answer["questionId"])
    point, letters = qid[0], qid[1:]
    if len(letters) <= 1:
        return f"Annex IV({point})({letters})"
    return f"Annex IV({point})({letters[0]})-({letters[1]})"


def _add_risk(
    g: Graph,
    ex: Namespace,
    system: URIRef,
    row: dict[str, Any],
    areas: dict[str, URIRef],
    names: dict[str, str],
) -> None:
    i = row["position"]
    affected = row["affected"]
    if affected not in _AFFECTED_CLASS:
        raise ValueError(f"unknown affected value: {affected!r} (expected operator or user)")

    risk = named(g, ex[f"risk{i}"], "Risk", row["risk"], names.get(f"risk{i}"))
    link(g, system, "hasRisk", risk)

    source = named(
        g, ex[f"risk{i}_source"], "RiskSource", row["source"], names.get(f"risk{i}_source")
    )
    link(g, source, "isRiskSourceFor", risk)
    if row.get("vulnerability"):
        link(
            g,
            source,
            "exploitsVulnerability",
            named(
                g,
                ex[f"risk{i}_vulnerability"],
                "Vulnerability",
                row["vulnerability"],
                names.get(f"risk{i}_vulnerability"),
            ),
        )

    consequence = named(
        g,
        ex[f"risk{i}_consequence"],
        "Consequence",
        row["consequence"],
        names.get(f"risk{i}_consequence"),
    )
    link(g, risk, "hasConsequence", consequence)

    # The Impact node has no field of its own: name it after the risk it realises.
    impact = named(
        g,
        ex[f"risk{i}_impact"],
        "Impact",
        row["risk"],
        names.get(f"risk{i}_impact") or names.get(f"risk{i}"),
    )
    link(g, consequence, "hasImpact", impact)
    # The affected stakeholder is the system's own operator or user node, so the
    # graph has one node per stakeholder rather than one per risk.
    stakeholder_prop = _AFFECTED_CLASS[affected]
    stakeholder = next(iter(g.objects(system, URIRef(AIRO + stakeholder_prop))))
    link(g, impact, "hasImpactOnStakeholder", stakeholder)

    for area_id in row.get("impactAreas", []):
        node = areas.get(area_id)
        if node is None:
            entry = _vocab_entry("impactArea", area_id)
            if entry is None:
                raise ValueError(f"unknown impactArea id: {area_id}")
            node = named(g, ex[f"area_{area_id}"], "AreaOfImpact", entry["label"])
            g.add((node, QUAL.formTag, Literal(area_id)))
            if entry.get("vair"):
                g.add((node, RDF.type, URIRef(f"https://w3id.org/vair#{entry['vair']}")))
            areas[area_id] = node
        link(g, impact, "hasImpactOnArea", node)

    control = named(
        g,
        ex[f"risk{i}_control"],
        "RiskControl",
        row["control"],
        names.get(f"risk{i}_control"),
    )
    link(g, control, "modifiesRiskConcept", risk)
    if row.get("followUpControl"):
        follow_up = named(
            g,
            ex[f"risk{i}_control_followup"],
            "RiskControl",
            row["followUpControl"],
            names.get(f"risk{i}_control_followup"),
        )
        link(g, control, "isFollowedByControl", follow_up)


def _cli() -> int:
    """python -m airo_min.build <qualification.json> [--extracted f.json] [--format turtle]"""
    import argparse
    import json
    from pathlib import Path

    from .validate import validate

    ap = argparse.ArgumentParser(description="Build an AIRO 3.1 graph from a qualification.")
    ap.add_argument("qualification", type=Path, help="JSON from scripts/export_qualification.mjs")
    ap.add_argument("--extracted", type=Path, help="JSON with techniques/components from an agent")
    ap.add_argument("--format", default="turtle", choices=["turtle", "json-ld"])
    ap.add_argument("--out", type=Path, help="write here instead of stdout")
    args = ap.parse_args()

    qualification = json.loads(args.qualification.read_text(encoding="utf-8"))
    extracted = (
        json.loads(args.extracted.read_text(encoding="utf-8")) if args.extracted else None
    )
    graph = build_graph(qualification, extracted)

    problems = validate(graph)
    for problem in problems:
        print(f"invalid: {problem}", file=__import__("sys").stderr)
    if problems:
        return 1

    text = graph.serialize(format=args.format)
    if args.out:
        args.out.write_text(text, encoding="utf-8")
        print(
            f"{len(graph)} triples -> {args.out}",
            file=__import__("sys").stderr,
        )
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
