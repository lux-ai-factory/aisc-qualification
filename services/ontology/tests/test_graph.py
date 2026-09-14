from rdflib import Graph, RDF, RDFS, Literal, URIRef
import pytest

from airo_min.graph import UnknownTerm, add_individual, link, new_graph, serialize
from airo_min.schema import AIRO

BASE = "https://example.org/q/abc123#"


def _system_with_one_risk():
    g, ex = new_graph(BASE)
    sys_ = add_individual(g, ex.system, "AISystem", "ShelfScan Vision 2.4.0")
    risk = add_individual(g, ex.risk1, "Risk", "Wrong out-of-stock alert")
    src = add_individual(g, ex.risk1_source, "RiskSource", "Poor lighting")
    link(g, sys_, "hasRisk", risk)
    link(g, src, "isRiskSourceFor", risk)
    return g, ex


def test_individuals_get_type_and_label():
    g, ex = _system_with_one_risk()
    assert (ex.system, RDF.type, URIRef(AIRO + "AISystem")) in g
    assert (ex.system, RDFS.label, Literal("ShelfScan Vision 2.4.0")) in g


def test_link_uses_the_airo_property_iri():
    g, ex = _system_with_one_risk()
    assert (ex.system, URIRef(AIRO + "hasRisk"), ex.risk1) in g


def test_unknown_class_is_rejected():
    g, ex = new_graph(BASE)
    with pytest.raises(UnknownTerm):
        add_individual(g, ex.x, "AIProvider")  # collapsed into AIOperator, not in subset


def test_unknown_property_is_rejected():
    g, ex = new_graph(BASE)
    a = add_individual(g, ex.a, "AISystem")
    b = add_individual(g, ex.b, "AIUser")
    with pytest.raises(UnknownTerm):
        link(g, a, "hasAISubject", b)  # dropped with the Subject collapse


@pytest.mark.parametrize("fmt", ["turtle", "json-ld"])
def test_serialise_and_reparse_preserves_every_triple(fmt):
    g, _ = _system_with_one_risk()
    text = serialize(g, fmt)
    back = Graph().parse(data=text, format=fmt)
    assert set(back) == set(g)


def test_turtle_uses_the_airo_prefix():
    g, _ = _system_with_one_risk()
    ttl = serialize(g, "turtle")
    assert "@prefix airo: <https://w3id.org/airo#>" in ttl
    assert "airo:hasRisk" in ttl



class TestTheGraphSaysWhatBuiltIt:
    """A preserved file has to name the definitions it was built against.

    The graph is a function of the answers *and* of the vocabularies and the
    code that assembled them. Without that stamp, a file kept for the record
    cannot be checked against the ontologies it used, and two files that differ
    give no clue why.
    """

    def _built(self):
        import json
        from pathlib import Path

        from airo_min.build import build_graph

        examples = Path(__file__).resolve().parents[1] / "examples"
        return build_graph(
            json.loads((examples / "mcas.qualification.json").read_text()),
            json.loads((examples / "mcas.extracted.json").read_text()),
        )

    def test_it_carries_the_digest_of_each_vendored_ontology(self):
        from airo_min.build import QUAL

        g = self._built()
        stamps = {str(o) for o in g.objects(None, QUAL.builtWith)}
        assert any(s.startswith("airo.ttl:sha256:") for s in stamps), stamps
        assert any(s.startswith("vair.ttl:sha256:") for s in stamps), stamps

    def test_the_digests_are_the_files_on_disk(self):
        import hashlib
        from pathlib import Path

        from airo_min.build import QUAL

        g = self._built()
        stamps = {str(o) for o in g.objects(None, QUAL.builtWith)}
        root = Path(__file__).resolve().parents[1] / "airo"
        for name in ("airo.ttl", "vair.ttl"):
            digest = hashlib.sha256((root / name).read_bytes()).hexdigest()
            assert f"{name}:sha256:{digest}" in stamps

    def test_it_carries_the_schema_it_was_built_from(self):
        from airo_min.build import QUAL

        g = self._built()
        stamps = {str(o) for o in g.objects(None, QUAL.builtWith)}
        assert any(s.startswith("airo_min:") for s in stamps), stamps

    def test_the_stamp_hangs_off_the_system_so_it_travels_with_the_card(self):
        from rdflib import RDF, URIRef

        from airo_min.build import QUAL
        from airo_min.schema import AIRO

        g = self._built()
        system = next(g.subjects(RDF.type, URIRef(AIRO + "AISystem")))
        assert list(g.objects(system, QUAL.builtWith))


class TestAGraphHasAStableIdentity:
    """Two builds of the same inputs are the same graph, whatever the bytes say.

    Answers hang off blank nodes, which rdflib labels afresh on every build, so
    serialising twice gives two different documents for one graph. Hashing the
    text therefore reported a new state on every page view. The identity of a
    graph is its triples up to blank-node renaming, which is what rdflib's
    canonical form computes.
    """

    def _twice(self):
        import json
        from pathlib import Path

        from airo_min.build import build_graph

        examples = Path(__file__).resolve().parents[1] / "examples"
        q = json.loads((examples / "mcas.qualification.json").read_text())
        e = json.loads((examples / "mcas.extracted.json").read_text())
        return build_graph(q, e), build_graph(q, e)

    def test_two_builds_serialise_differently(self):
        first, second = self._twice()
        assert first.serialize(format="turtle") != second.serialize(format="turtle")

    def test_but_they_are_the_same_graph(self):
        from airo_min.graph import graph_digest

        first, second = self._twice()
        assert graph_digest(first) == graph_digest(second)

    def test_a_changed_graph_gets_a_different_digest(self):
        from rdflib import Literal, RDFS, URIRef

        from airo_min.graph import graph_digest

        first, second = self._twice()
        before = graph_digest(second)
        node = next(iter(second.subjects(RDFS.label, None)))
        second.remove((node, RDFS.label, None))
        second.add((node, RDFS.label, Literal("something else")))
        assert graph_digest(second) != before

    def test_the_digest_is_hex_and_stable_in_shape(self):
        from airo_min.graph import graph_digest

        first, _ = self._twice()
        digest = graph_digest(first)
        assert len(digest) == 64 and int(digest, 16) >= 0
