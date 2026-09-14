"""The VAIR terms available for each AIRO class, read from the vendored file.

VAIR is a taxonomy, not a flat list: vair:Police is a subclass of
vair:EmergencyServiceProvider, which is a subclass of airo:AIOperator. A term is
therefore available for an AIRO class when a chain of rdfs:subClassOf (or one
rdf:type, for the terms VAIR declares as individuals) leads from it to that
class. Reading only the direct children offered 136 of 331 terms, and Purpose,
the class that decides whether a system is high-risk, showed 27 of 122.

The module also records what VAIR 1.0 gets wrong, because using all of a
vocabulary precisely means knowing which parts of it are unusable:

  DANGLING    101 terms with no rdfs:subClassOf at all, so under no class. A mix
              of superseded spellings (SVM, EmergancyTriage, TrainingData) and
              AI Act roles nobody wired up (AuthorisedRepresentative,
              NotifiedBody, Distributor, Importer, SmallScaleProvider).
  MISPREFIXED 17 terms that landed under VAIR's @base
              (http://www.semanticweb.org/owl/owlapi/turtle#) instead of its own
              namespace. 16 have a correctly-prefixed twin; API does not, so no
              IRI in the vair namespace names it and nothing can refer to it.

Neither group is ever offered: a term we cannot address is a term we cannot
write into a graph.
"""
from functools import lru_cache
from pathlib import Path

from rdflib import Graph, RDF, RDFS, URIRef

from .schema import AIRO, CLASSES

VAIR = "https://w3id.org/vair#"
#: VAIR's @base, which 17 of its terms were declared against by mistake.
VAIR_BASE = "http://www.semanticweb.org/owl/owlapi/turtle#"

_TTL = Path(__file__).resolve().parents[1] / "airo" / "vair.ttl"


@lru_cache(maxsize=1)
def _graph() -> Graph:
    return Graph().parse(_TTL, format="turtle")


def _local(iri: URIRef, namespace: str) -> str:
    return str(iri)[len(namespace) :]


@lru_cache(maxsize=1)
def every_vair_term() -> frozenset[str]:
    """Every local name VAIR defines in its own namespace, sound or not."""
    return frozenset(
        _local(s, VAIR) for s in set(_graph().subjects()) if str(s).startswith(VAIR)
    )


def _descendants(roots: frozenset[URIRef]) -> set[URIRef]:
    """Everything in the VAIR namespace reachable downward from `roots`."""
    g = _graph()
    seen: set[URIRef] = set()
    frontier = set(roots)
    while frontier:
        nxt: set[URIRef] = set()
        for parent in frontier:
            children = set(g.subjects(RDFS.subClassOf, parent))
            # VAIR declares some terms as individuals of an AIRO class rather
            # than as subclasses; both are ways of saying "is one of these".
            children |= set(g.subjects(RDF.type, parent))
            for child in children:
                if str(child).startswith(VAIR) and child not in seen:
                    seen.add(child)
                    nxt.add(child)
        frontier = nxt
    return seen


@lru_cache(maxsize=None)
def terms_for(cls: str) -> list[str]:
    """The terms a node of AIRO class `cls` may take, sorted.

    Raises KeyError for a class outside our schema, rather than returning an
    empty list: "this class has no terms" and "this class does not exist" are
    different answers and only one of them is the UI's business.
    """
    if cls not in CLASSES:
        raise KeyError(f"{cls!r} is not a class in the minimal AIRO schema")
    return sorted(_local(t, VAIR) for t in _descendants(frozenset({URIRef(AIRO + cls)})))


@lru_cache(maxsize=1)
def vocabularies() -> dict[str, list[str]]:
    """Every class in the schema mapped to its terms, empty list included."""
    return {cls: terms_for(cls) for cls in CLASSES}


@lru_cache(maxsize=1)
def typeable_classes() -> frozenset[str]:
    """The classes VAIR actually subdivides."""
    return frozenset(cls for cls, terms in vocabularies().items() if terms)


def is_term_for(cls: str | None, term: str) -> bool:
    """Whether `term` is a term VAIR defines under `cls`.

    The question the builder has to ask. Membership of the VAIR namespace is not
    enough: vair:Police is a real term and a nonsense type for a Purpose node.
    """
    if cls is None or cls not in CLASSES:
        return False
    return term in terms_for(cls)


@lru_cache(maxsize=1)
def terms_reachable_from_airo() -> frozenset[str]:
    """Terms reachable from any of AIRO's classes, not just our subset.

    The gap between this and `vocabularies()` is the vocabulary our schema gives
    up by implementing Figure 3 only: AISubject, Standard, Documentation,
    AILifecyclePhase, AutomationLevel, HumanInvolvement,
    ModeOfOutputControllability and Output.
    """
    from rdflib import OWL

    airo = Graph().parse(_TTL.parent / "airo.ttl", format="turtle")
    roots = frozenset(
        s
        for s in airo.subjects(RDF.type, OWL.Class)
        if str(s).startswith(AIRO)
    )
    return frozenset(_local(t, VAIR) for t in _descendants(roots))


def _dangling() -> frozenset[str]:
    g = _graph()
    reachable = terms_reachable_from_airo()
    return frozenset(
        name
        for name in every_vair_term()
        if name not in reachable
        and not any(g.objects(URIRef(VAIR + name), RDFS.subClassOf))
    )


def _misprefixed() -> dict[str, dict[str, object]]:
    g = _graph()
    out: dict[str, dict[str, object]] = {}
    for subject in set(g.subjects()):
        if not str(subject).startswith(VAIR_BASE):
            continue
        name = _local(subject, VAIR_BASE)
        parents = [
            _local(o, AIRO)
            for o in g.objects(subject, RDFS.subClassOf)
            if str(o).startswith(AIRO)
        ]
        twin = URIRef(VAIR + name)
        out[name] = {
            "parent": parents[0] if parents else None,
            "twin": any(True for _ in g.predicate_objects(twin)),
        }
    return out


#: See the module docstring. Computed once: these are facts about a fixed file.
DANGLING: frozenset[str] = _dangling()
MISPREFIXED: dict[str, dict[str, object]] = _misprefixed()
