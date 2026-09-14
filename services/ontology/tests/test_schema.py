"""schema.py must be a faithful subset of the vendored airo.ttl, with only the two
deliberate collapses (provider/deployer -> AIOperator, subject folded into user)."""
from rdflib import RDF, RDFS, OWL, URIRef

from airo_min.schema import AIRO, CLASSES, PROPERTIES, SUBCLASS_EDGES, ancestors, is_a


def _uri(name: str) -> URIRef:
    return URIRef(AIRO + name)


def _union_members(g, node):
    """Resolve an owl:unionOf blank node (or a plain IRI) to local class names."""
    if isinstance(node, URIRef):
        return {str(node).replace(AIRO, "")}
    out = set()
    for lst in g.objects(node, OWL.unionOf):
        cur = lst
        while cur and cur != RDF.nil:
            first = g.value(cur, RDF.first)
            if first is not None:
                out |= _union_members(g, first)
            cur = g.value(cur, RDF.rest)
    return out


def test_exactly_the_figure_3_subset_with_the_collapse():
    assert len(CLASSES) == 19
    assert len(PROPERTIES) == 19
    for removed in ("AIProvider", "AIDeployer", "AISubject"):
        assert removed not in CLASSES
    assert "hasAISubject" not in PROPERTIES


def test_every_class_exists_in_airo(airo_graph):
    for cls in CLASSES:
        assert (_uri(cls), RDF.type, OWL.Class) in airo_graph, cls


def test_every_parent_edge_is_declared_in_airo(airo_graph):
    for child, parent in SUBCLASS_EDGES:
        assert (_uri(child), RDFS.subClassOf, _uri(parent)) in airo_graph, (child, parent)
    assert len(SUBCLASS_EDGES) == 6


def test_every_property_exists_in_airo_with_matching_domain(airo_graph):
    for prop, (domains, _rng) in PROPERTIES.items():
        assert (_uri(prop), RDF.type, OWL.ObjectProperty) in airo_graph, prop
        declared = set()
        for d in airo_graph.objects(_uri(prop), RDFS.domain):
            declared |= _union_members(airo_graph, d)
        # our domains are AIRO's declared domains restricted to classes in the subset
        expected = {d for d in declared if d in CLASSES}
        assert set(domains) == expected, (prop, set(domains), expected)


def test_every_range_is_airos_range_or_its_collapsed_parent(airo_graph):
    for prop, (_domains, rng) in PROPERTIES.items():
        declared = [
            str(r).replace(AIRO, "") for r in airo_graph.objects(_uri(prop), RDFS.range)
        ]
        assert len(declared) == 1, (prop, declared)
        airo_range = declared[0]
        if airo_range == rng:
            continue
        # the only permitted difference is the provider/deployer collapse
        assert (_uri(airo_range), RDFS.subClassOf, _uri(rng)) in airo_graph, (
            prop,
            airo_range,
            rng,
        )
        assert prop in ("isProvidedBy", "isDeployedBy")


def test_ancestors_and_is_a_walk_the_hierarchy():
    assert ancestors("Impact") == ["Consequence", "RiskConcept"]
    assert ancestors("AISystem") == []
    assert is_a("AIOperator", "Stakeholder")
    assert is_a("Impact", "RiskConcept")
    assert is_a("Risk", "Risk")
    assert not is_a("Risk", "Impact")
