"""The JSON the card offers for download must rebuild the ontology.

That is the whole promise of the download, so it is worth proving rather than
assuming: parse the JSON-LD back and compare it triple for triple with the graph
it came from.
"""
import json
from pathlib import Path

from rdflib import Graph, RDF, URIRef
import pytest

from airo_min.build import build_graph
from airo_min.patch import apply_patch
from airo_min.schema import AIRO, PROPERTIES
from airo_min.validate import validate

EXAMPLES = Path(__file__).resolve().parents[1] / "examples"
VAIR = "https://w3id.org/vair#"


@pytest.fixture(scope="module")
def source() -> Graph:
    q = json.loads((EXAMPLES / "mcas.qualification.json").read_text(encoding="utf-8"))
    e = json.loads((EXAMPLES / "mcas.extracted.json").read_text(encoding="utf-8"))
    g = build_graph(q, e)
    # with a reviewer's corrections in place, since those must survive too
    apply_patch(
        g,
        {
            "provider": {
                "termNotApplicable": True,
                "note": "VAIR names only Annex III public bodies",
            },
            "purpose": {"label": "Consumer credit scoring"},
        },
    )
    return g


def test_the_jsonld_parses_back_to_the_same_graph(source):
    rebuilt = Graph().parse(data=source.serialize(format="json-ld"), format="json-ld")
    assert len(rebuilt) == len(source)
    assert set(rebuilt) == set(source)


def test_the_rebuilt_graph_is_still_valid_airo(source):
    rebuilt = Graph().parse(data=source.serialize(format="json-ld"), format="json-ld")
    assert validate(rebuilt) == []


def test_the_rebuilt_graph_keeps_every_airo_relation(source):
    rebuilt = Graph().parse(data=source.serialize(format="json-ld"), format="json-ld")
    used = {
        str(p).replace(AIRO, "")
        for p in set(rebuilt.predicates())
        if str(p).startswith(AIRO)
    }
    assert used == set(PROPERTIES)


def test_the_rebuilt_graph_keeps_the_vair_types(source):
    rebuilt = Graph().parse(data=source.serialize(format="json-ld"), format="json-ld")
    before = {
        str(o) for _s, o in source.subject_objects(RDF.type) if str(o).startswith(VAIR)
    }
    after = {
        str(o) for _s, o in rebuilt.subject_objects(RDF.type) if str(o).startswith(VAIR)
    }
    assert after == before
    assert len(after) >= 10


def test_the_rebuilt_graph_keeps_the_reviewer_s_corrections(source):
    rebuilt = Graph().parse(data=source.serialize(format="json-ld"), format="json-ld")
    from airo_min.build import QUAL

    assert "Consumer credit scoring" in {
        str(o) for _s, o in rebuilt.subject_objects(URIRef(
            "http://www.w3.org/2000/01/rdf-schema#label"
        ))
    }
    reviewed = [
        s
        for s in rebuilt.subjects(QUAL.provenance, None)
        if str(rebuilt.value(s, QUAL.provenance)) == "reviewed"
    ]
    assert len(reviewed) == 2
    assert any(
        rebuilt.value(s, QUAL.termNotApplicable) is not None for s in reviewed
    )


def test_the_rebuilt_graph_keeps_the_annex_iv_answers(source):
    rebuilt = Graph().parse(data=source.serialize(format="json-ld"), format="json-ld")
    from airo_min.build import QUAL

    texts = {str(o) for _s, o in rebuilt.subject_objects(QUAL.text)}
    assert len(texts) == 13
    assert sum(len(t) for t in texts) == 9697
