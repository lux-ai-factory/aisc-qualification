from rdflib import RDF, URIRef

from airo_min.graph import add_individual, link, new_graph
from airo_min.schema import AIRO
from airo_min.validate import validate

BASE = "https://example.org/q/abc123#"


def _valid_graph():
    g, ex = new_graph(BASE)
    sys_ = add_individual(g, ex.system, "AISystem")
    op = add_individual(g, ex.acme, "AIOperator", "Acme")
    user = add_individual(g, ex.staff, "AIUser", "Store staff")
    risk = add_individual(g, ex.r1, "Risk")
    cons = add_individual(g, ex.r1_cons, "Consequence")
    imp = add_individual(g, ex.r1_imp, "Impact")
    ctrl = add_individual(g, ex.r1_ctrl, "RiskControl")
    link(g, sys_, "isProvidedBy", op)
    link(g, sys_, "hasAIUser", user)
    link(g, sys_, "hasRisk", risk)
    link(g, risk, "hasConsequence", cons)
    link(g, cons, "hasImpact", imp)
    link(g, imp, "hasImpactOnStakeholder", user)  # AIUser is a Stakeholder
    link(g, ctrl, "modifiesRiskConcept", risk)  # Risk is a RiskConcept
    return g, ex


def test_valid_graph_has_no_problems():
    g, _ = _valid_graph()
    assert validate(g) == []


def test_range_violation_is_reported():
    g, ex = _valid_graph()
    # hasRisk must point at a Risk; point it at the operator instead
    link(g, ex.system, "hasRisk", ex.acme)
    problems = validate(g)
    assert any("hasRisk" in p and "Risk" in p for p in problems)


def test_domain_violation_is_reported():
    g, ex = _valid_graph()
    # isRiskSourceFor's subject must be a RiskSource; use the system
    link(g, ex.system, "isRiskSourceFor", ex.r1)
    problems = validate(g)
    assert any("isRiskSourceFor" in p and "RiskSource" in p for p in problems)


def test_unknown_airo_property_in_the_graph_is_reported():
    g, ex = _valid_graph()
    g.add((ex.system, URIRef(AIRO + "hasAISubject"), ex.staff))
    assert any("hasAISubject" in p for p in validate(g))


def test_unknown_airo_class_in_the_graph_is_reported():
    g, ex = _valid_graph()
    g.add((ex.x, RDF.type, URIRef(AIRO + "AIProvider")))
    assert any("AIProvider" in p for p in validate(g))


def test_untyped_object_is_reported():
    g, ex = _valid_graph()
    link(g, ex.system, "hasPurpose", ex.untyped)
    assert any("hasPurpose" in p and "Purpose" in p for p in validate(g))
