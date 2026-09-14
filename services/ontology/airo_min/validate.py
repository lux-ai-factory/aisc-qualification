"""Check an instance graph against the minimal AIRO schema.

Not SHACL: a plain structural check that every AIRO term used is in the subset and
that domains and ranges hold, with subclass reasoning from schema.is_a.
"""
from rdflib import Graph, RDF, URIRef

from .schema import AIRO, CLASSES, PROPERTIES, is_a


def _local(term) -> str | None:
    s = str(term)
    return s[len(AIRO) :] if s.startswith(AIRO) else None


def _types_of(g: Graph, node) -> list[str]:
    return [t for t in (_local(o) for o in g.objects(node, RDF.type)) if t is not None]


def _satisfies(types: list[str], target: str) -> bool:
    return any(is_a(t, target) for t in types)


def validate(g: Graph) -> list[str]:
    problems: list[str] = []

    for s, o in g.subject_objects(RDF.type):
        name = _local(o)
        if name is not None and name not in CLASSES:
            problems.append(f"unknown class airo:{name} on {s}")

    for s, p, o in g:
        name = _local(p)
        if name is None:
            continue
        if name not in PROPERTIES:
            problems.append(f"unknown property airo:{name} on {s}")
            continue
        domains, rng = PROPERTIES[name]
        if domains and not any(_satisfies(_types_of(g, s), d) for d in domains):
            problems.append(f"{name}: subject {s} is not a {' or '.join(domains)}")
        if not isinstance(o, URIRef) or not _satisfies(_types_of(g, o), rng):
            problems.append(f"{name}: object {o} is not a {rng}")

    return problems
