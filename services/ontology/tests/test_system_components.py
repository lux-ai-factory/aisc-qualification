"""The card's Components block: each row is a part of the system with a stable key carried
across card versions, so assessments and their results can name it. With rows, the component
nodes come from them (one per key); without rows, they come from the extraction."""
from rdflib import RDF, RDFS, Graph, Literal, URIRef

from airo_min.build import build_graph
from airo_min.schema import AIRO

QUAL = "https://lux-ai-factory.github.io/qualification/ns#"
K1, K2, K3 = ("0b9c7a1e-0000-4000-8000-000000000001", "0b9c7a1e-0000-4000-8000-000000000002",
              "0b9c7a1e-0000-4000-8000-000000000003")


def card(**over):
    base = {"id": "card1", "systemName": "MCAS", "systemVersion": "1.2.0", "company": "LIST",
            "targetUseCase": "Score micro-credit applications"}
    base.update(over)
    return base


ROWS = [
    {"key": K1, "name": "Scoring model", "role": "Scores each application", "kind": "model",
     "vairType": "DecisionTree", "provider": "in_house", "providerName": None},
    {"key": K2, "name": "Training data", "role": "Past applications and outcomes", "kind": "training_data",
     "provider": "in_house", "providerName": None},
    {"key": K3, "name": "Hosted explanation LLM", "role": "Explains a decision", "kind": "llm",
     "provider": "third_party", "providerName": "OpenAI"},
]


def node_of(g, key):
    (node,) = list(g.subjects(URIRef(QUAL + "componentKey"), Literal(key)))
    return node


def test_ql5_one_node_per_row_named_by_its_key():
    g = build_graph(card(systemComponents=ROWS))
    for row in ROWS:
        node = node_of(g, row["key"])
        assert str(node).endswith("#component-" + row["key"])
        assert (node, RDFS.label, Literal(row["name"])) in g
        assert (node, URIRef(QUAL + "kind"), Literal(row["kind"])) in g
        assert (node, URIRef(QUAL + "role"), Literal(row["role"])) in g


def test_ql5_the_kind_decides_the_class_and_the_airo_property():
    g = build_graph(card(systemComponents=ROWS))
    system = next(g.subjects(RDF.type, URIRef(AIRO + "AISystem")))
    model, data, llm = (node_of(g, k) for k in (K1, K2, K3))
    assert (model, RDF.type, URIRef(AIRO + "AIModel")) in g
    assert (system, URIRef(AIRO + "hasModel"), model) in g
    assert (data, RDF.type, URIRef(AIRO + "Data")) in g
    assert (system, URIRef(AIRO + "hasTrainingData"), data) in g
    assert (llm, RDF.type, URIRef(AIRO + "AIModel")) in g


def test_ql5_other_kinds_are_plain_components():
    rows = [{"key": K1, "name": "Policy-rule engine", "role": "", "kind": "rule_engine", "provider": "in_house"}]
    g = build_graph(card(systemComponents=rows))
    system = next(g.subjects(RDF.type, URIRef(AIRO + "AISystem")))
    node = node_of(g, K1)
    assert (node, RDF.type, URIRef(AIRO + "AIComponent")) in g
    assert (system, URIRef(AIRO + "hasComponent"), node) in g


def test_ql5_a_third_party_keeps_its_provider():
    g = build_graph(card(systemComponents=ROWS))
    llm = node_of(g, K3)
    assert (llm, URIRef(QUAL + "provider"), Literal("third_party")) in g
    assert (llm, URIRef(QUAL + "providerName"), Literal("OpenAI")) in g


def test_ql5_with_rows_the_extracted_components_are_not_emitted():
    extracted = {"components": [{"label": "Scoring model"}, {"label": "Something else"}]}
    g = build_graph(card(systemComponents=ROWS), extracted)
    labels = {str(o) for s in g.subjects(RDF.type, URIRef(AIRO + "AIComponent")) for o in g.objects(s, RDFS.label)}
    assert "Something else" not in labels
    assert not any(str(s).endswith("#component0") for s in g.subjects())


def test_ql6_without_rows_the_graph_is_exactly_as_before():
    extracted = {"components": [{"label": "Scoring model"}, {"label": "Policy-rule engine"}]}
    before = build_graph(card(), extracted)
    also_empty = build_graph(card(systemComponents=[]), extracted)
    assert set(before) == set(also_empty)
    assert any(str(s).endswith("#component0") for s in before.subjects())


def test_ql7_a_linked_engine_item_says_which_component_it_is():
    engine = [{"pid": "11111111-2222-4333-8444-555555555555", "name": "mcas-train.parquet",
               "property": "hasTrainingData", "objectName": "mcas-train.parquet", "componentKey": K2}]
    g = build_graph(card(systemComponents=ROWS, engineComponents=engine))
    item = URIRef("urn:aisc:component:11111111-2222-4333-8444-555555555555")
    assert (item, URIRef(QUAL + "implements"), node_of(g, K2)) in g


def test_ql7_an_unknown_component_key_on_a_link_is_refused():
    engine = [{"pid": "11111111-2222-4333-8444-555555555555", "name": "x", "property": "hasModel",
               "objectName": "x", "componentKey": "not-on-this-card"}]
    try:
        build_graph(card(systemComponents=ROWS, engineComponents=engine))
    except ValueError as exc:
        assert "not-on-this-card" in str(exc)
    else:
        raise AssertionError("an unknown component key was accepted")


# Through the service: /build keeps what the builder reads (pydantic drops undeclared fields)

def test_ql5_the_build_endpoint_passes_the_rows_and_the_links_to_the_builder():
    from fastapi.testclient import TestClient
    from app import app

    engine = [{"pid": "11111111-2222-4333-8444-555555555555", "name": "mcas-train.parquet",
               "property": "hasTrainingData", "objectName": "mcas-train.parquet", "componentKey": K2,
               "componentType": "dataset"}]
    r = TestClient(app).post("/build", json={"qualification": card(systemComponents=ROWS, engineComponents=engine)})
    assert r.status_code == 200, r.text
    g = Graph().parse(data=r.json()["turtle"], format="turtle")
    assert (None, URIRef(QUAL + "componentKey"), Literal(K1)) in g
    item = URIRef("urn:aisc:component:11111111-2222-4333-8444-555555555555")
    assert (item, URIRef(QUAL + "implements"), node_of(g, K2)) in g
