"""Turn a saved qualification into a filled AIRO 3.1 graph.

Two kinds of input, kept apart on purpose:

  * Structured form fields (tags, pickers, risk rows) map deterministically onto
    AIRO properties. No judgment, no model. Wherever VAIR has a vocabulary for a field the
    form offers only VAIR's terms (2026-09-30), so the node is typed with the term the author
    chose and, where the field has no text of its own, named with VAIR's label.
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
from .vair_terms import VAIR, every_vair_term, is_term_for
from .vair_vocab import MODEL_TERMS, label_of
from .annex_points import annex_citation

#: The seeded questions' scopes. Their answers get no triple beyond today's, so a
#: card filled with the default form builds the very graph it built before forms.
_SEEDED_SCOPES = frozenset({"annex-1", "annex-2"})

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


def _typed(g: Graph, node: URIRef, term: str | None, as_class: str | None = None) -> None:
    """Add a VAIR type, refusing anything that is not a term for this node's class.

    Membership of the VAIR namespace is not enough. vair:Police is a real term
    and a nonsense type for a Purpose node, and 101 of VAIR's names hang off no
    class at all, so nothing should ever be typed with them. The class comes from
    the node itself, which already carries its airo:* type by this point, unless
    `as_class` names the class whose terms apply: VAIR subdivides AIComponent, not
    its subclass AIModel, so a model's type is one of AIComponent's terms.
    """
    if not term:
        return
    cls = as_class or _airo_class(g, node)
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


#: The AIRO property an engine component is linked by, and the class of its node.
COMPONENT_RANGE = {
    "hasModel": "AIModel",
    "hasTrainingData": "Data",
    "hasTestingData": "Data",
    "hasValidationData": "Data",
    "hasComponent": "AIComponent",
}


#: A row of the card's Components block, by its kind: the AIRO class of its node and the property
#: the system has it by (targets plan v2). Data the system is built on is a component (it can be
#: what an assessment is about); a test set is not a kind: it is what an assessment uses.
COMPONENT_KINDS = {
    "model": ("AIModel", "hasModel"),
    "llm": ("AIModel", "hasModel"),
    "rule_engine": ("AIComponent", "hasComponent"),
    "training_data": ("Data", "hasTrainingData"),
    "validation_data": ("Data", "hasValidationData"),
    "other_data": ("Data", "hasComponent"),
    "pipeline": ("AIComponent", "hasComponent"),
    "interface": ("AIComponent", "hasComponent"),
    "other": ("AIComponent", "hasComponent"),
}


def build_graph(
    qualification: dict[str, Any],
    extracted: dict[str, Iterable[str]] | None = None,
    base: str | None = None,
) -> Graph:
    """Build the AIRO graph for one qualification.

    `qualification` is the export shape produced by QualificationExporter.toExport:
    metadata, the VAIR terms the author chose (`systemType`, `purpose`, the four tag
    sets, each component's `vairType`, each risk field's `...Term`), `answers` and `risks`.
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
        f"{qualification.get('systemName', '')} {qualification.get('systemVersion', '')}".strip(),
    )
    g.add((system, QUAL.qualificationId, Literal(qid)))
    # A form may leave a block out: it then arrives as "" (or is missing) and adds nothing.
    if qualification.get("description", ""):
        g.add((system, QUAL.description, Literal(qualification["description"])))

    # The system's own type, when the author chose one.
    _typed(g, system, qualification.get("systemType"))

    # ── the four tag sets: one node per VAIR term, named by VAIR ─────────────
    for field, prop, cls, prefix in (
        ("targetSystemTags", "hasCapability", "AICapability", "capability"),
        ("sectorTags", "isAppliedWithinDomain", "Domain", "domain"),
        ("marketFormTags", "hasModality", "Modality", "modality"),
        ("localityTags", "isUsedWithinLocality", "LocalityOfUse", "locality"),
    ):
        for i, term in enumerate(qualification.get(field) or []):
            node = named(g, ex[f"{prefix}{i}"], cls, label_of(term))
            _typed(g, node, term)
            g.add((node, QUAL.formTag, Literal(term)))
            link(g, system, prop, node)

    # ── purpose, operators, users ────────────────────────────────────────────
    # One Purpose node: named by the use case the author wrote, typed with the VAIR purpose they
    # chose. A form without the use-case block still has the purpose, named by VAIR.
    purpose_term = qualification.get("purpose")
    if qualification.get("targetUseCase", "") or purpose_term:
        purpose = named(
            g,
            ex.purpose,
            "Purpose",
            qualification.get("targetUseCase") or label_of(purpose_term),
            names.get("purpose"),
        )
        _typed(g, purpose, purpose_term)
        link(g, system, "hasPurpose", purpose)
    link(
        g,
        system,
        "isProvidedBy",
        named(g, ex.provider, "AIOperator", qualification.get("company", ""), names.get("provider")),
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
    if qualification.get("targetUsers", ""):
        link(
            g,
            system,
            "hasAIUser",
            named(g, ex.users, "AIUser", qualification["targetUsers"], names.get("users")),
        )

    # ── the Components block: one node per row, named by its stable key ──────
    # A card with rows says what its parts are; the extraction's guesses then give way to them.
    rows = qualification.get("systemComponents") or []
    component_nodes: dict[str, URIRef] = {}
    for row in rows:
        if row["kind"] not in COMPONENT_KINDS:
            raise ValueError(f"{row['kind']!r} is not a component kind; expected one of {', '.join(COMPONENT_KINDS)}")
        cls, prop = COMPONENT_KINDS[row["kind"]]
        vair_type = _component_vair_type(row)
        node = named(g, ex["component-" + row["key"]], cls, row["name"])
        _typed(g, node, vair_type, as_class="AIComponent")
        if vair_type is None:
            # One of our own types: the author chose it because VAIR has no term for the part,
            # which is what a reviewer's "no term applies" records too.
            g.add((node, QUAL.termNotApplicable, Literal(True)))
        g.add((node, QUAL.componentKey, Literal(row["key"])))
        g.add((node, QUAL.kind, Literal(row["kind"])))
        if row.get("role"):
            g.add((node, QUAL.role, Literal(row["role"])))
        g.add((node, QUAL.provider, Literal(row.get("provider") or "in_house")))
        if row.get("providerName"):
            g.add((node, QUAL.providerName, Literal(row["providerName"])))
        _provenance(g, node, "form")
        link(g, system, prop, node)
        component_nodes[row["key"]] = node

    # ── prose-derived, supplied by an agent ──────────────────────────────────
    for prop, key, cls, prefix, citation in (
        ("usesTechnique", "techniques", "AITechnique", "technique", "Annex IV(2)(a)"),
        ("hasComponent", "components", "AIComponent", "component", "Annex IV(2)(c)"),
    ):
        if key == "components" and rows:
            continue
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

    # ── engine components the card links, each by its AIRO property ──────────
    # One node per engine component, named by its engine pid, so the card joins
    # what the engine tests. The free-text components above stay as they are.
    for entry in qualification.get("engineComponents") or []:
        prop = entry["property"]
        if prop not in COMPONENT_RANGE:
            raise ValueError(
                f"{prop!r} is not a component property; expected one of "
                f"{', '.join(sorted(COMPONENT_RANGE))}"
            )
        node = add_individual(
            g, URIRef("urn:aisc:component:" + entry["pid"]), COMPONENT_RANGE[prop], entry.get("name")
        )
        g.add((node, QUAL.objectName, Literal(entry.get("objectName", ""))))
        link(g, system, prop, node)
        if entry.get("componentKey"):
            if entry["componentKey"] not in component_nodes:
                raise ValueError(f"engine component {entry['pid']} names component {entry['componentKey']!r},"
                                 " which is not on this card")
            g.add((node, QUAL.implements, component_nodes[entry["componentKey"]]))

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
    # An answer exported with a form carries its question's `annexPoint`. Tagged,
    # it is an answer under that point's citation; untagged (None), it is not
    # Annex IV documentation and stays out of the graph (A17): the card lists it
    # under "Additional documentation" instead. No key at all is a legacy export.
    for answer in qualification.get("answers", []):
        if "annexPoint" in answer and answer["annexPoint"] is None:
            continue
        node = BNode()
        g.add((system, QUAL.answer, node))
        if "annexPoint" in answer:
            point = str(answer["annexPoint"])
            try:
                citation = annex_citation(point)
            except KeyError:
                raise ValueError(f"{point!r} is not an Annex IV point") from None
            g.add((node, QUAL.citation, Literal(citation)))
        else:
            g.add((node, QUAL.citation, Literal(_annex_citation(answer))))
        g.add((node, QUAL.questionId, Literal(f"{answer['toolId']}:{answer['questionId']}")))
        g.add((node, QUAL.text, Literal(answer["answer"])))
        if "annexPoint" in answer and answer["toolId"] not in _SEEDED_SCOPES:
            # A custom question: which point it answers, and the source it cites.
            g.add((node, QUAL.annexPoint, Literal(point)))
            if answer.get("citation"):
                g.add((node, QUAL.sourceCitation, Literal(answer["citation"])))

    return g


#: The kinds a component of one of our own types has: the types VAIR has no term for.
OWN_COMPONENT_KINDS = frozenset(COMPONENT_KINDS) - {"model"}


def _component_vair_type(row: dict[str, Any]) -> str | None:
    """A row's VAIR type, checked against its kind.

    The form has one Type list: VAIR's AIComponent terms, plus our own only where VAIR has none.
    A VAIR term decides the kind (a term under vair:Model makes a model, any other term makes
    `other`); one of our own types is its kind and has no term. A row where the two disagree was
    not written by the form, and the graph would say two things about the same part.
    """
    kind, term = row["kind"], row.get("vairType")
    if term:
        if not is_term_for("AIComponent", term):
            raise ValueError(f"{term!r} is not a term VAIR defines for AIComponent")
        expected = "model" if term in MODEL_TERMS else "other"
        if kind != expected:
            raise ValueError(f"component {row.get('name')!r}: a {term} is of kind {expected}, not {kind}")
        return term
    if kind not in OWN_COMPONENT_KINDS:
        raise ValueError(f"component {row.get('name')!r}: a {kind} needs its VAIR type")
    return None


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
    _typed(g, source, row.get("sourceTerm"))
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
    _typed(g, consequence, row.get("consequenceTerm"))
    link(g, risk, "hasConsequence", consequence)

    # The Impact node has no field of its own: name it after the risk it realises.
    impact = named(
        g,
        ex[f"risk{i}_impact"],
        "Impact",
        row["risk"],
        names.get(f"risk{i}_impact") or names.get(f"risk{i}"),
    )
    _typed(g, impact, row.get("impactTerm"))
    link(g, consequence, "hasImpact", impact)
    # The affected stakeholder is the system's own operator or user node, so the
    # graph has one node per stakeholder rather than one per risk.
    stakeholder_prop = _AFFECTED_CLASS[affected]
    # A form without the users block has no AIUser node: the chain then has no
    # stakeholder rather than failing.
    stakeholder = next(iter(g.objects(system, URIRef(AIRO + stakeholder_prop))), None)
    if stakeholder is not None:
        link(g, impact, "hasImpactOnStakeholder", stakeholder)

    for term in row.get("impactAreas", []):
        node = areas.get(term)
        if node is None:
            node = named(g, ex[f"area_{term}"], "AreaOfImpact", label_of(term))
            _typed(g, node, term)
            g.add((node, QUAL.formTag, Literal(term)))
            areas[term] = node
        link(g, impact, "hasImpactOnArea", node)

    control = named(
        g,
        ex[f"risk{i}_control"],
        "RiskControl",
        row["control"],
        names.get(f"risk{i}_control"),
    )
    _typed(g, control, row.get("controlTerm"))
    link(g, control, "modifiesRiskConcept", risk)
    if row.get("followUpControl"):
        follow_up = named(
            g,
            ex[f"risk{i}_control_followup"],
            "RiskControl",
            row["followUpControl"],
            names.get(f"risk{i}_control_followup"),
        )
        _typed(g, follow_up, row.get("followUpControlTerm"))
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
