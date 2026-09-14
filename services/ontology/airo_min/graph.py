"""Build AIRO instance graphs restricted to the minimal schema."""
from rdflib import Graph, Literal, Namespace, RDF, RDFS, URIRef

from .schema import AIRO, CLASSES, PROPERTIES

AIRO_NS = Namespace(AIRO)


class UnknownTerm(ValueError):
    """A class or property outside the minimal AIRO subset."""


def new_graph(base: str) -> tuple[Graph, Namespace]:
    g = Graph()
    g.bind("airo", AIRO_NS)
    ex = Namespace(base)
    g.bind("ex", ex)
    return g, ex


def add_individual(g: Graph, iri: URIRef, cls: str, label: str | None = None) -> URIRef:
    if cls not in CLASSES:
        raise UnknownTerm(f"unknown class {cls!r}; not in the minimal AIRO subset")
    g.add((iri, RDF.type, AIRO_NS[cls]))
    if label:
        g.add((iri, RDFS.label, Literal(label)))
    return iri


def link(g: Graph, subject: URIRef, prop: str, obj: URIRef) -> None:
    if prop not in PROPERTIES:
        raise UnknownTerm(f"unknown property {prop!r}; not in the minimal AIRO subset")
    g.add((subject, AIRO_NS[prop], obj))


def serialize(g: Graph, fmt: str = "turtle") -> str:
    return g.serialize(format=fmt)


def graph_digest(g: Graph) -> str:
    """The identity of a graph: its triples, up to blank-node renaming.

    Serialising twice gives two different documents, because answers hang off
    blank nodes and rdflib labels those afresh each time. Hashing the text would
    therefore call every rebuild a new state. rdflib's canonical form assigns
    blank nodes stable labels derived from their surroundings, which is what
    makes two builds of the same answers compare equal.
    """
    import hashlib

    from rdflib.compare import to_canonical_graph

    canonical = to_canonical_graph(g)
    lines = sorted(canonical.serialize(format="nt").splitlines())
    return hashlib.sha256("\n".join(lines).encode("utf-8")).hexdigest()
