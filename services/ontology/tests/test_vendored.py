"""The vendored ontologies are the ones we analysed: same size, same licence."""
from rdflib import RDF, OWL, URIRef, Namespace

TERMS = Namespace("http://purl.org/dc/terms/")
CC_BY = URIRef("https://creativecommons.org/licenses/by/4.0/")


def test_airo_is_the_1_0_release_we_analysed(airo_graph):
    assert len(airo_graph) == 558
    onto = URIRef("https://w3id.org/airo")
    assert (onto, RDF.type, OWL.Ontology) in airo_graph
    assert (onto, TERMS.license, CC_BY) in airo_graph


def test_vair_is_the_1_0_release_we_analysed(vair_graph):
    assert len(vair_graph) == 5803
    onto = URIRef("https://w3id.org/vair")
    assert (onto, TERMS.license, CC_BY) in vair_graph
