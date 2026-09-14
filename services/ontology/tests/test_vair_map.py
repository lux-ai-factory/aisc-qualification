"""Our form taxonomies are not VAIR's. Where a mapping exists it must point at a
real VAIR term of the right AIRO class; where it does not, the builder falls back
to a label-only node rather than inventing a term."""
from rdflib import RDF, RDFS, URIRef

from airo_min.schema import AIRO
from airo_min.vair_map import (
    CAPABILITY_TO_VAIR,
    SECTOR_TO_VAIR,
    vair_capability,
    vair_sector,
)

VAIR = "https://w3id.org/vair#"


def _is_vair_kind(g, term: str, airo_cls: str) -> bool:
    t = URIRef(VAIR + term)
    c = URIRef(AIRO + airo_cls)
    return (t, RDFS.subClassOf, c) in g or (t, RDF.type, c) in g


def test_every_mapped_sector_points_at_a_real_vair_domain(vair_graph):
    assert SECTOR_TO_VAIR, "expected at least one sector mapping"
    for sector, term in SECTOR_TO_VAIR.items():
        assert _is_vair_kind(vair_graph, term, "Domain"), (sector, term)


def test_every_mapped_capability_points_at_a_real_vair_capability(vair_graph):
    assert CAPABILITY_TO_VAIR, "expected at least one capability mapping"
    for tag, term in CAPABILITY_TO_VAIR.items():
        assert _is_vair_kind(vair_graph, term, "AICapability"), (tag, term)


def test_capability_keys_are_composite_category_sub_tags():
    for tag in CAPABILITY_TO_VAIR:
        assert tag.count(":") == 1, tag


def test_lookup_returns_the_vair_iri_or_none():
    assert vair_sector("finance-and-insurance") == VAIR + "PrivateService"
    assert vair_sector("agriculture") is None  # no Annex III domain for it
    assert (
        vair_capability("natural-language-processing:question-answering")
        == VAIR + "QuestionAnswering"
    )
    assert vair_capability("other:neuromorphic-edge-ai") is None


def test_the_legally_loaded_credit_scoring_mapping_is_left_to_the_agents():
    # Mapping risk scoring onto vair:Profiling or vair:SocialScoring is a legal
    # judgment (Art 5 prohibits social scoring), so it is absent.
    assert "predictive-analytical-ai:risk-scoring-assessment" not in CAPABILITY_TO_VAIR
    assert "SocialScoring" not in CAPABILITY_TO_VAIR.values()
