"""The form speaks VAIR (2026-09-30): every structured field arrives as a VAIR term.

VAIR has precedence: wherever it has a vocabulary for a field, the form offers only VAIR's terms,
and the builder types the node with the term the author chose and names it with VAIR's label. The
card is built from the form alone, so none of these nodes waits for an agent to type it.
"""
import pytest
from rdflib import RDF, RDFS, URIRef

from airo_min.build import build_graph
from airo_min.schema import AIRO
from airo_min.validate import validate

VAIR = "https://w3id.org/vair#"


def base() -> dict:
    return {
        "id": "q-vair",
        "systemName": "MCAS",
        "systemVersion": "1.2.0",
        "company": "Creditum AI SARL",
        "description": "Credit scoring.",
        "targetUseCase": "Scores consumer loan applications.",
        "targetUsers": "Loan applicants and loan officers.",
        "intendedDeployers": "Retail banks.",
        "systemType": "NarrowAI",
        "purpose": "AssessingCreditworthiness",
        "targetSystemTags": ["Profiling", "NaturalLanguageGeneration"],
        "sectorTags": ["PrivateService"],
        "marketFormTags": ["Software"],
        "localityTags": ["Workplace"],
        "answers": [],
        "risks": [
            {
                "position": 0,
                "risk": "An applicant is wrongly refused",
                "source": "Thin bureau data",
                "sourceTerm": "IncompleteTrainingData",
                "vulnerability": "No low-coverage path",
                "consequence": "A creditworthy applicant is refused",
                "consequenceTerm": "DegradedAccuracy",
                "impactTerm": "UnfavourableTreatment",
                "affected": "user",
                "impactAreas": ["RightToNondiscrimination", "Right"],
                "control": "Human review of every rejection",
                "controlTerm": "HumanOversightMeasure",
                "followUpControl": "Override with written justification",
                "followUpControlTerm": "OverridingOutcome",
            }
        ],
        "systemComponents": [
            {"key": "k-model", "name": "Scoring model", "role": None, "kind": "model",
             "vairType": "DecisionTree", "provider": "in_house", "providerName": None},
            {"key": "k-tool", "name": "Feature library", "role": None, "kind": "other",
             "vairType": "MachineLearningLibrary", "provider": "in_house", "providerName": None},
            {"key": "k-llm", "name": "Hosted LLM", "role": None, "kind": "llm",
             "vairType": None, "provider": "third_party", "providerName": "Acme"},
        ],
    }


def types_of(g, node) -> set[str]:
    return {str(o)[len(VAIR):] for o in g.objects(node, RDF.type) if str(o).startswith(VAIR)}


def label(g, node) -> str:
    return str(g.value(node, RDFS.label))


def objects(g, subject, prop):
    return list(g.objects(subject, URIRef(AIRO + prop)))


def system(g):
    return next(g.subjects(RDF.type, URIRef(AIRO + "AISystem")))


def test_the_graph_is_valid():
    assert validate(build_graph(base())) == []


# ── system type and purpose ──────────────────────────────────────────────────


def test_the_system_type_types_the_system_node():
    g = build_graph(base())
    assert types_of(g, system(g)) == {"NarrowAI"}


def test_the_purpose_types_the_purpose_node_named_by_the_use_case():
    g = build_graph(base())
    [purpose] = objects(g, system(g), "hasPurpose")
    assert types_of(g, purpose) == {"AssessingCreditworthiness"}
    assert label(g, purpose) == "Scores consumer loan applications."


def test_a_purpose_without_the_use_case_block_is_named_by_vair():
    q = base()
    q["targetUseCase"] = ""
    g = build_graph(q)
    [purpose] = objects(g, system(g), "hasPurpose")
    assert types_of(g, purpose) == {"AssessingCreditworthiness"}
    assert label(g, purpose) == "Assessing Creditworthiness"


def test_both_are_optional():
    q = base()
    q["systemType"] = None
    q["purpose"] = None
    g = build_graph(q)
    assert types_of(g, system(g)) == set()
    [purpose] = objects(g, system(g), "hasPurpose")
    assert types_of(g, purpose) == set()


@pytest.mark.parametrize("field,term", [("systemType", "Police"), ("purpose", "Workplace"), ("purpose", "Nonsense")])
def test_a_term_of_another_class_is_refused(field, term):
    q = base()
    q[field] = term
    with pytest.raises(ValueError):
        build_graph(q)


# ── the four tag sets ────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "field,prop,cls,terms,labels",
    [
        ("targetSystemTags", "hasCapability", "AICapability", {"Profiling", "NaturalLanguageGeneration"},
         {"Profiling", "Natural Language Generation"}),
        ("sectorTags", "isAppliedWithinDomain", "Domain", {"PrivateService"}, {"Private Service"}),
        ("marketFormTags", "hasModality", "Modality", {"Software"}, {"Software"}),
        ("localityTags", "isUsedWithinLocality", "LocalityOfUse", {"Workplace"}, {"Workplace"}),
    ],
)
def test_each_tag_is_a_node_typed_with_its_term_and_named_by_vair(field, prop, cls, terms, labels):
    g = build_graph(base())
    nodes = objects(g, system(g), prop)
    assert {t for n in nodes for t in types_of(g, n)} == terms
    assert {label(g, n) for n in nodes} == labels
    assert all((n, RDF.type, URIRef(AIRO + cls)) in g for n in nodes)


@pytest.mark.parametrize(
    "field,value",
    [
        ("targetSystemTags", "natural-language-processing:question-answering"),  # our old tag
        ("sectorTags", "finance-and-insurance"),  # our old sector
        ("marketFormTags", "software"),  # our old id
        ("localityTags", "other"),  # ours, VAIR has no "other"
        ("sectorTags", "Workplace"),  # a VAIR term, of another class
    ],
)
def test_anything_but_a_term_of_the_field_s_class_is_refused(field, value):
    q = base()
    q[field] = [value]
    with pytest.raises(ValueError):
        build_graph(q)


# ── the Components block ─────────────────────────────────────────────────────


COMPONENT_KEY = URIRef("https://lux-ai-factory.github.io/qualification/ns#componentKey")


def component(g, key):
    return (s for s, o in g.subject_objects(COMPONENT_KEY) if str(o) == key)


def test_a_model_type_makes_a_typed_model_the_system_has_by_has_model():
    g = build_graph(base())
    node = next(component(g, "k-model"))
    assert (node, RDF.type, URIRef(AIRO + "AIModel")) in g
    assert types_of(g, node) == {"DecisionTree"}
    assert node in objects(g, system(g), "hasModel")


def test_any_other_vair_type_makes_a_typed_component():
    g = build_graph(base())
    node = next(component(g, "k-tool"))
    assert (node, RDF.type, URIRef(AIRO + "AIComponent")) in g
    assert types_of(g, node) == {"MachineLearningLibrary"}
    assert node in objects(g, system(g), "hasComponent")


def test_one_of_our_own_types_has_no_vair_term():
    g = build_graph(base())
    node = next(component(g, "k-llm"))
    assert (node, RDF.type, URIRef(AIRO + "AIModel")) in g
    assert types_of(g, node) == set()


@pytest.mark.parametrize(
    "kind,vair_type",
    [("other", "DecisionTree"), ("model", "Tool"), ("model", None), ("llm", "Tool"), ("other", "Police")],
)
def test_a_kind_that_disagrees_with_its_vair_type_is_refused(kind, vair_type):
    q = base()
    q["systemComponents"] = [{"key": "k", "name": "Part", "role": None, "kind": kind,
                              "vairType": vair_type, "provider": "in_house", "providerName": None}]
    with pytest.raises(ValueError):
        build_graph(q)


# ── the risk chain ───────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "node_id,term",
    [
        ("risk0_source", "IncompleteTrainingData"),
        ("risk0_consequence", "DegradedAccuracy"),
        ("risk0_impact", "UnfavourableTreatment"),
        ("risk0_control", "HumanOversightMeasure"),
        ("risk0_control_followup", "OverridingOutcome"),
    ],
)
def test_each_risk_field_s_term_types_its_node_and_its_text_names_it(node_id, term):
    g = build_graph(base())
    node = URIRef(f"https://lux-ai-factory.github.io/qualification/q/q-vair#{node_id}")
    assert types_of(g, node) == {term}


def test_the_text_still_names_the_node():
    g = build_graph(base())
    node = URIRef("https://lux-ai-factory.github.io/qualification/q/q-vair#risk0_control")
    assert label(g, node) == "Human review of every rejection"


def test_the_areas_are_vair_terms_named_by_vair():
    g = build_graph(base())
    impact = URIRef("https://lux-ai-factory.github.io/qualification/q/q-vair#risk0_impact")
    areas = objects(g, impact, "hasImpactOnArea")
    assert {t for a in areas for t in types_of(g, a)} == {"RightToNondiscrimination", "Right"}
    assert {label(g, a) for a in areas} == {"Right To Non-discrimination", "Right"}


@pytest.mark.parametrize(
    "field,value",
    [("sourceTerm", "Workplace"), ("consequenceTerm", "Harm"), ("impactTerm", "Bias"),
     ("controlTerm", "Nonsense"), ("followUpControlTerm", "DataPoisoning")],
)
def test_a_risk_term_of_another_class_is_refused(field, value):
    q = base()
    q["risks"][0][field] = value
    with pytest.raises(ValueError):
        build_graph(q)


def test_an_old_area_id_is_refused():
    q = base()
    q["risks"][0]["impactAreas"] = ["right"]
    with pytest.raises(ValueError):
        build_graph(q)


# ── the point of it all ──────────────────────────────────────────────────────


def test_every_form_node_of_a_class_vair_types_has_its_term():
    """Built from the form alone, no node that VAIR can type is left without a term. Risk and
    Vulnerability have no VAIR terms; the provider and deployer are companies, which VAIR's
    AIOperator terms (public bodies) do not describe; users have none."""
    from airo_min.vair_terms import typeable_classes

    g = build_graph(base())
    untyped = []
    for node, cls in g.subject_objects(RDF.type):
        name = str(cls)[len(AIRO):] if str(cls).startswith(AIRO) else None
        if name is None or name not in typeable_classes() or name == "AIOperator":
            continue
        if name == "AIModel":
            continue  # our own types (LLM) have no VAIR term by definition
        if not types_of(g, node):
            untyped.append((str(node), name))
    assert untyped == []


def test_one_of_our_own_types_says_that_no_vair_term_applies():
    """Picking a type from the "Not in VAIR" group is the author saying VAIR has no term for this
    part, so the card does not show it as waiting for one."""
    from airo_min.build import QUAL
    from airo_min.view import build_view

    q = base()
    q["systemComponents"].append({"key": "k-rules", "name": "Policy rules", "role": None, "kind": "rule_engine",
                                  "vairType": None, "provider": "in_house", "providerName": None})
    g = build_graph(q)
    rules = next(component(g, "k-rules"))
    assert g.value(rules, QUAL.termNotApplicable) is not None
    assert g.value(next(component(g, "k-tool")), QUAL.termNotApplicable) is None
    assert build_view(g)["counts"]["needsTerm"] == 0
