"""The card's components link to the engine's real ones.

A card lists, in its export shape, the engine components a person linked on the
card's page (`engineComponents`), each with the AIRO property that says what it
is to the system. The graph must carry them as AIRO edges from the system node to
one node per engine component, named by its engine pid, so a reader can join the
card to what the engine tests. The free-text components the filler drafts stay
`hasComponent` nodes.
"""
import json
from pathlib import Path

import pytest
from rdflib import RDF, RDFS, Graph, Literal, URIRef
from rdflib.compare import isomorphic

from airo_min.build import QUAL, build_graph
from airo_min.schema import AIRO, CLASSES, PROPERTIES

EXAMPLES = Path(__file__).resolve().parents[1] / "examples"

MODEL_PID = "6f1c2a10-0000-4000-8000-00000000a001"
DATASET_PID = "6f1c2a10-0000-4000-8000-00000000d002"

ENGINE_COMPONENTS = [
    {
        "pid": MODEL_PID,
        "name": "MCAS scorer",
        "componentType": "model",
        "objectName": "models/mcas-gbdt.pkl",
        "property": "hasModel",
    },
    {
        "pid": DATASET_PID,
        "name": "Held-out applications",
        "componentType": "dataset",
        "objectName": "datasets/holdout-2025.csv",
        "property": "hasTestingData",
    },
]


def _a(name: str) -> URIRef:
    return URIRef(AIRO + name)


def _node(pid: str) -> URIRef:
    return URIRef("urn:aisc:component:" + pid)


@pytest.fixture(scope="module")
def graph() -> Graph:
    q = json.loads((EXAMPLES / "mcas.qualification.json").read_text(encoding="utf-8"))
    q["engineComponents"] = ENGINE_COMPONENTS
    e = json.loads((EXAMPLES / "mcas.extracted.json").read_text(encoding="utf-8"))
    return build_graph(q, e)


def _system(g: Graph) -> URIRef:
    systems = list(g.subjects(RDF.type, _a("AISystem")))
    assert len(systems) == 1
    return systems[0]


def test_s6_1_linked_components_are_airo_edges_from_the_system(graph):
    system = _system(graph)
    assert (system, _a("hasModel"), _node(MODEL_PID)) in graph
    assert (system, _a("hasTestingData"), _node(DATASET_PID)) in graph


def test_s6_1_each_component_node_is_typed_by_the_property_range(graph):
    assert (_node(MODEL_PID), RDF.type, _a("AIModel")) in graph
    assert (_node(DATASET_PID), RDF.type, _a("Data")) in graph


def test_s6_1_each_component_node_carries_its_name_and_object_name(graph):
    assert (_node(MODEL_PID), RDFS.label, Literal("MCAS scorer")) in graph
    assert (_node(MODEL_PID), QUAL.objectName, Literal("models/mcas-gbdt.pkl")) in graph
    assert (_node(DATASET_PID), QUAL.objectName, Literal("datasets/holdout-2025.csv")) in graph


def test_s6_1_the_jsonld_parses_back_to_the_same_triples(graph):
    rebuilt = Graph().parse(data=graph.serialize(format="json-ld"), format="json-ld")
    assert set(rebuilt) == set(graph)
    system = _system(rebuilt)
    assert (system, _a("hasModel"), _node(MODEL_PID)) in rebuilt
    assert (system, _a("hasTestingData"), _node(DATASET_PID)) in rebuilt


def test_s6_1_other_component_types_map_to_their_range():
    q = json.loads((EXAMPLES / "mcas.qualification.json").read_text(encoding="utf-8"))
    q["engineComponents"] = [
        {"pid": "p-train", "name": "Train", "componentType": "dataset",
         "objectName": "t.csv", "property": "hasTrainingData"},
        {"pid": "p-val", "name": "Val", "componentType": "dataset",
         "objectName": "v.csv", "property": "hasValidationData"},
        {"pid": "p-shape", "name": "Shape", "componentType": "datashape",
         "objectName": "s.json", "property": "hasComponent"},
    ]
    g = build_graph(q, {})
    system = _system(g)
    assert (system, _a("hasTrainingData"), _node("p-train")) in g
    assert (_node("p-train"), RDF.type, _a("Data")) in g
    assert (system, _a("hasValidationData"), _node("p-val")) in g
    assert (_node("p-val"), RDF.type, _a("Data")) in g
    assert (system, _a("hasComponent"), _node("p-shape")) in g
    assert (_node("p-shape"), RDF.type, _a("AIComponent")) in g


def test_s6_1_without_engine_components_the_graph_is_unchanged():
    q = json.loads((EXAMPLES / "mcas.qualification.json").read_text(encoding="utf-8"))
    e = json.loads((EXAMPLES / "mcas.extracted.json").read_text(encoding="utf-8"))
    plain = build_graph(q, e)
    q["engineComponents"] = []
    # blank nodes are relabelled per build, so compare up to renaming
    assert isomorphic(build_graph(q, e), plain)


# schema.py adds the four sub-properties, cross-checked against airo.ttl
@pytest.mark.parametrize(
    "prop,rng",
    [
        ("hasModel", "AIModel"),
        ("hasTrainingData", "Data"),
        ("hasTestingData", "Data"),
        ("hasValidationData", "Data"),
    ],
)
def test_s6_1_schema_has_the_component_sub_properties(airo_graph, prop, rng):
    assert prop in PROPERTIES, prop
    assert PROPERTIES[prop][1] == rng
    assert rng in CLASSES
    assert (_a(prop), RDFS.subPropertyOf, _a("hasComponent")) in airo_graph
    assert (_a(prop), RDFS.range, _a(rng)) in airo_graph
    assert (_a(rng), RDF.type, URIRef("http://www.w3.org/2002/07/owl#Class")) in airo_graph
