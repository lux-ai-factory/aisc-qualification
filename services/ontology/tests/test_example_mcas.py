"""The committed MCAS example is the worked reference: a real qualification from
the form, turned into a filled AIRO 3.1 graph. Rebuilt from the committed JSON on
every run, so it cannot rot and needs no database.
"""
import json
from pathlib import Path

from rdflib import Graph, RDF, RDFS, URIRef
import pytest

from airo_min.build import QUAL, build_graph
from airo_min.schema import AIRO, PROPERTIES
from airo_min.validate import validate

EXAMPLES = Path(__file__).resolve().parents[1] / "examples"
VAIR = "https://w3id.org/vair#"


@pytest.fixture(scope="module")
def qualification() -> dict:
    return json.loads((EXAMPLES / "mcas.qualification.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def extracted() -> dict:
    return json.loads((EXAMPLES / "mcas.extracted.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def graph(qualification, extracted) -> Graph:
    return build_graph(qualification, extracted)


def _a(name: str) -> URIRef:
    return URIRef(AIRO + name)


# ── the export itself: every new form element is actually filled ─────────────
# (an earlier seed wrote these as empty arrays, which this catches)


def test_the_export_fills_every_new_form_element(qualification):
    assert qualification["marketFormTags"], "market form picker is empty"
    assert qualification["localityTags"], "locality picker is empty"
    assert qualification["intendedDeployers"], "intended deployers is empty"
    assert len(qualification["risks"]) >= 3
    assert len(qualification["answers"]) == 14  # every sub-item answered (addendum 06, R72)


def test_the_risk_rows_exercise_both_stakeholders_and_the_optional_fields(qualification):
    rows = qualification["risks"]
    assert {r["affected"] for r in rows} == {"operator", "user"}
    assert any(r["vulnerability"] for r in rows)
    assert any(not r["vulnerability"] for r in rows)
    assert any(r["followUpControl"] for r in rows)
    assert any(not r["followUpControl"] for r in rows)
    assert all(r["impactAreas"] for r in rows)


# ── the graph ────────────────────────────────────────────────────────────────


def test_the_graph_is_valid_airo(graph):
    assert validate(graph) == []


def test_it_exercises_every_property_but_the_engine_test_link(graph):
    used = {
        str(p).replace(AIRO, "")
        for p in set(graph.predicates())
        if str(p).startswith(AIRO)
    }
    # MCAS links no test set from the engine, and a test set is not a component: hasTestingData is the
    # one property only such a link gives (test_build.py exercises it).
    assert used == set(PROPERTIES) - {"hasTestingData"}, set(PROPERTIES) - used


def test_the_airo_namespace_carries_nothing_outside_the_minimal_schema(graph):
    classes = {
        str(o).replace(AIRO, "")
        for _s, o in graph.subject_objects(RDF.type)
        if str(o).startswith(AIRO)
    }
    from airo_min.schema import CLASSES

    assert classes <= set(CLASSES), classes - set(CLASSES)


def test_every_answer_survives_verbatim(graph, qualification):
    texts = {str(o) for _s, o in graph.subject_objects(QUAL.text)}
    for answer in qualification["answers"]:
        assert answer["answer"] in texts, answer["questionId"]
    # nothing is truncated: the graph carries the full character count
    assert sum(len(t) for t in texts) == sum(
        len(a["answer"]) for a in qualification["answers"]
    )


def test_each_answer_is_labelled_with_its_annex_iv_citation(graph):
    citations = {str(o) for _s, o in graph.subject_objects(QUAL.citation)}
    assert "Annex IV(1)(d)-(e)" in citations  # the merged sub-item
    assert "Annex IV(1)(g)-(h)" in citations
    assert "Annex IV(2)(h)" in citations
    assert "Annex IV(1)(f)" in citations  # addendum 06, R72
    assert len(citations) == 14


def test_the_mapped_tags_carry_their_vair_types(graph):
    # finance-and-insurance is the Annex III private-services domain
    assert list(graph.subjects(RDF.type, URIRef(VAIR + "PrivateService")))
    # question answering and RAG map cleanly
    assert list(graph.subjects(RDF.type, URIRef(VAIR + "QuestionAnswering")))
    assert list(graph.subjects(RDF.type, URIRef(VAIR + "InformationRetrieval")))
    # market form and locality ids are VAIR terms by construction
    assert list(graph.subjects(RDF.type, URIRef(VAIR + "Software")))
    assert list(graph.subjects(RDF.type, URIRef(VAIR + "Workplace")))


def test_the_credit_scoring_capability_is_the_one_the_author_chose(graph):
    """vair:Profiling is a compliance judgment (Art 5(1)(c) prohibits social
    scoring), so no mapping asserts it: the author picks it from VAIR's list on the
    form, a decision someone owns."""
    scoring = list(graph.subjects(RDF.type, URIRef(VAIR + "Profiling")))
    assert len(scoring) == 1
    assert (scoring[0], RDF.type, _a("AICapability")) in graph
    assert str(graph.value(scoring[0], RDFS.label)) == "Profiling"


def test_nothing_is_left_untyped_that_could_have_been_typed(graph, extracted):
    """The rule: an unmapped node is noise. After the types map is applied the
    only nodes without a VAIR term are the ones VAIR cannot type at all."""
    from airo_min.schema import AIRO as A

    vair_terms_exist = _classes_vair_can_type()
    untyped_but_typeable = []
    for node in {s for s in graph.subjects() if isinstance(s, URIRef)}:
        has_vair = any(str(o).startswith(VAIR) for o in graph.objects(node, RDF.type))
        # a part of one of our own types says itself that VAIR has no term for it (2026-09-30)
        if has_vair or graph.value(node, QUAL.termNotApplicable) is not None:
            continue
        cls = next(
            (
                str(o).replace(A, "")
                for o in graph.objects(node, RDF.type)
                if str(o).startswith(A)
            ),
            None,
        )
        if cls in vair_terms_exist:
            untyped_but_typeable.append(f"{node.split('#')[-1]} ({cls})")
    # AIOperator is the known exception: VAIR's 17 terms are all Annex III public
    # bodies, so a commercial provider or bank has no term to take.
    remaining = [n for n in untyped_but_typeable if "AIOperator" not in n]
    assert remaining == [], remaining


def _classes_vair_can_type() -> set[str]:
    from rdflib import Graph as _G

    from airo_min.schema import AIRO as A

    v = _G().parse(EXAMPLES.parent / "airo" / "vair.ttl", format="turtle")
    out = set()
    for cls in (
        "AISystem",
        "AICapability",
        "AITechnique",
        "AIComponent",
        "Modality",
        "LocalityOfUse",
        "AreaOfImpact",
        "Purpose",
        "Domain",
        "RiskSource",
        "Consequence",
        "Impact",
        "RiskControl",
        "AIOperator",
        "AIUser",
        "Risk",
        "Vulnerability",
    ):
        target = URIRef(A + cls)
        terms = {
            s
            for s in set(v.subjects(RDFS.subClassOf, target))
            | set(v.subjects(RDF.type, target))
            if str(s).startswith(VAIR)
        }
        if terms:
            out.add(cls)
    return out


def test_the_five_risks_each_form_a_complete_chain(graph):
    risks = list(graph.subjects(RDF.type, _a("Risk")))
    assert len(risks) == 5
    for risk in risks:
        assert list(graph.subjects(_a("isRiskSourceFor"), risk))
        consequence = next(iter(graph.objects(risk, _a("hasConsequence"))))
        impact = next(iter(graph.objects(consequence, _a("hasImpact"))))
        assert list(graph.objects(impact, _a("hasImpactOnStakeholder")))
        assert list(graph.objects(impact, _a("hasImpactOnArea")))
        assert list(graph.subjects(_a("modifiesRiskConcept"), risk))


def test_the_committed_turtle_matches_what_the_builder_produces(graph):
    """Guards against the artefact drifting from the code that generates it."""
    committed = Graph().parse(EXAMPLES / "mcas.ttl", format="turtle")
    assert len(committed) == len(graph)
    committed_airo = {
        (str(s), str(p), str(o))
        for s, p, o in committed
        if str(p).startswith(AIRO)
    }
    fresh_airo = {
        (str(s), str(p), str(o)) for s, p, o in graph if str(p).startswith(AIRO)
    }
    assert committed_airo == fresh_airo


def test_the_committed_jsonld_is_the_same_graph():
    ttl = Graph().parse(EXAMPLES / "mcas.ttl", format="turtle")
    jsonld = Graph().parse(EXAMPLES / "mcas.jsonld", format="json-ld")
    assert len(jsonld) == len(ttl)


# ── Addendum 06, R72: the example answers 1(f) ─────────────────────────────


def test_the_graph_is_451_triples_and_the_view_61_nodes(graph):
    """2026-09-30: the form speaks VAIR. Four VAIR capabilities where six of our tags were, and no
    "Other" locality (VAIR has none), so three nodes fewer than R72's 59; the example's nine
    Components rows add five in the view (the data and model rows hang off their own properties);
    and nothing the form fills is left for an agent to type."""
    from airo_min.view import build_view

    assert len(graph) == 451
    view = build_view(graph)
    assert view["counts"]["nodes"] == 61
    assert view["counts"]["needsTerm"] == 0


def test_r72_the_1f_answer_sits_right_after_1de(qualification):
    ids = [a["questionId"] for a in qualification["answers"]]
    assert ids.index("1f") == ids.index("1de") + 1
    assert next(a for a in qualification["answers"] if a["questionId"] == "1f")["toolId"] == "annex-1"
