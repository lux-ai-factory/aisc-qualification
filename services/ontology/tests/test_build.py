"""A saved qualification becomes a filled AIRO 3.1 graph.

Everything the form captures as a structured field is deterministic. The two
properties that live inside prose (usesTechnique from 2(a), hasComponent from
2(c)) come from the `extracted` slot, which is where an agent's output lands.
"""
from rdflib import Namespace, RDF, RDFS, URIRef
import pytest

from airo_min.build import QUAL, build_graph
from airo_min.patch import apply_patch
from airo_min.view import node_view
from airo_min.schema import AIRO, PROPERTIES
from airo_min.validate import validate

VAIR = "https://w3id.org/vair#"


def _qualification(**over):
    q = {
        "id": "q123",
        "systemName": "MicroCredit Assist Score",
        "systemVersion": "v1.2.0",
        "company": "Creditum AI SARL",
        "description": "Credit scoring for consumer loans.",
        "targetUseCase": "Evaluate creditworthiness for EUR 100 to 5,000 loans.",
        "targetUsers": "Bank customers and loan officers.",
        "intendedDeployers": "Retail banks in DE, FR and NL.",
        "targetSystemTags": ["QuestionAnswering", "Profiling"],
        "sectorTags": ["PrivateService"],
        "marketFormTags": ["Software"],
        "localityTags": ["Workplace"],
        "answers": [
            {"toolId": "annex-2", "questionId": "2d", "answer": "620,000 loan outcomes."},
            {"toolId": "annex-1", "questionId": "1a", "answer": "v1.2.0 follows v1.1.x."},
        ],
        "risks": [
            {
                "position": 0,
                "risk": "An applicant is wrongly ranked as high risk",
                "source": "Bureau data missing or stale",
                "vulnerability": "Features assume complete bureau coverage",
                "consequence": "A creditworthy applicant is routed to Reject",
                "affected": "user",
                "impactAreas": ["Right"],
                "control": "Every Reject goes to a loan officer first",
                "followUpControl": "Officer override with written justification",
            },
            {
                "position": 1,
                "risk": "Training data is poisoned",
                "source": "Attack on the bureau ingestion path",
                "vulnerability": None,
                "consequence": "Degraded accuracy across a market",
                "affected": "operator",
                "impactAreas": ["Safety", "Right"],
                "control": "Signed ingestion and checksummed artefacts",
                "followUpControl": None,
            },
        ],
    }
    q.update(over)
    return q


EXTRACTED = {
    "techniques": ["Gradient-boosted decision tree", "Retrieval-augmented LLM"],
    "components": ["Ingest and feature service", "Scoring model", "Policy-rule engine"],
}


def _a(name):
    return URIRef(AIRO + name)


def test_the_graph_is_valid_airo():
    g = build_graph(_qualification(), EXTRACTED)
    assert validate(g) == []


def test_the_system_node_carries_name_and_version():
    g = build_graph(_qualification())
    sys_ = next(g.subjects(RDF.type, _a("AISystem")))
    assert g.value(sys_, RDFS.label) is not None
    assert "v1.2.0" in str(g.value(sys_, RDFS.label))


def test_structured_fields_fill_their_properties():
    g = build_graph(_qualification())
    sys_ = next(g.subjects(RDF.type, _a("AISystem")))
    counts = {
        "hasCapability": 2,
        "isAppliedWithinDomain": 1,
        "hasModality": 1,
        "isUsedWithinLocality": 1,
        "hasPurpose": 1,
        "isProvidedBy": 1,
        "isDeployedBy": 1,
        "hasAIUser": 1,
        "hasRisk": 2,
    }
    for prop, n in counts.items():
        assert len(list(g.objects(sys_, _a(prop)))) == n, prop


def test_a_tag_gets_its_vair_type_as_well_as_the_airo_one():
    g = build_graph(_qualification())
    qa = URIRef(VAIR + "QuestionAnswering")
    typed = [s for s in g.subjects(RDF.type, qa)]
    assert len(typed) == 1
    assert (typed[0], RDF.type, _a("AICapability")) in g
    assert str(g.value(typed[0], RDFS.label)) == "Question Answering"
    assert list(g.subjects(RDF.type, URIRef(VAIR + "PrivateService")))


def test_each_risk_row_becomes_a_full_chain():
    g = build_graph(_qualification())
    risks = list(g.subjects(RDF.type, _a("Risk")))
    assert len(risks) == 2
    for r in risks:
        src = list(g.subjects(_a("isRiskSourceFor"), r))
        assert len(src) == 1
        cons = list(g.objects(r, _a("hasConsequence")))
        assert len(cons) == 1
        imp = list(g.objects(cons[0], _a("hasImpact")))
        assert len(imp) == 1
        assert list(g.objects(imp[0], _a("hasImpactOnStakeholder")))
        assert list(g.objects(imp[0], _a("hasImpactOnArea")))
        assert list(g.subjects(_a("modifiesRiskConcept"), r))


def test_optional_row_fields_appear_only_when_present():
    g = build_graph(_qualification())
    assert len(list(g.subject_objects(_a("exploitsVulnerability")))) == 1
    assert len(list(g.subject_objects(_a("isFollowedByControl")))) == 1


def test_impact_lands_on_the_operator_or_the_user_node():
    g = build_graph(_qualification())
    sys_ = next(g.subjects(RDF.type, _a("AISystem")))
    user = next(iter(g.objects(sys_, _a("hasAIUser"))))
    provider = next(iter(g.objects(sys_, _a("isProvidedBy"))))
    targets = {
        o for _s, o in g.subject_objects(_a("hasImpactOnStakeholder"))
    }
    assert user in targets
    assert provider in targets


def test_extracted_prose_fills_the_last_two_properties():
    g = build_graph(_qualification(), EXTRACTED)
    sys_ = next(g.subjects(RDF.type, _a("AISystem")))
    assert len(list(g.objects(sys_, _a("usesTechnique")))) == 2
    assert len(list(g.objects(sys_, _a("hasComponent")))) == 3


def test_without_extraction_those_two_are_simply_absent_not_invented():
    g = build_graph(_qualification())
    sys_ = next(g.subjects(RDF.type, _a("AISystem")))
    assert list(g.objects(sys_, _a("usesTechnique"))) == []
    assert list(g.objects(sys_, _a("hasComponent"))) == []


def test_every_annex_iv_answer_is_preserved_verbatim_with_its_citation():
    q = _qualification()
    g = build_graph(q)
    texts = {str(o) for _s, o in g.subject_objects(QUAL.text)}
    for a in q["answers"]:
        assert a["answer"] in texts
    citations = {str(o) for _s, o in g.subject_objects(QUAL.citation)}
    assert "Annex IV(2)(d)" in citations
    assert "Annex IV(1)(a)" in citations


def test_annotations_use_our_namespace_so_the_airo_structure_is_untouched():
    g = build_graph(_qualification(), EXTRACTED)
    airo_props = {
        str(p).replace(AIRO, "") for p in set(g.predicates()) if str(p).startswith(AIRO)
    }
    assert airo_props <= set(PROPERTIES), airo_props - set(PROPERTIES)
    assert str(QUAL).startswith("http")
    assert validate(g) == []


def test_a_full_qualification_exercises_every_property():
    """Every property of the schema, the four component properties included: the
    Components block gives the model and the data the system is built on, and a test set the card
    links from the engine gives hasTestingData (a test set is not a component)."""
    rows = [
        {"key": "00000000-0000-4000-8000-000000000001", "name": "Scoring model", "role": None, "kind": "model",
         "vairType": "DecisionTree", "provider": "in_house", "providerName": None},
        {"key": "00000000-0000-4000-8000-000000000002", "name": "Training data", "role": None,
         "kind": "training_data", "vairType": None, "provider": "in_house", "providerName": None},
        {"key": "00000000-0000-4000-8000-000000000003", "name": "Validation data", "role": None,
         "kind": "validation_data", "vairType": None, "provider": "in_house", "providerName": None},
        {"key": "00000000-0000-4000-8000-000000000004", "name": "Policy rules", "role": None,
         "kind": "rule_engine", "vairType": None, "provider": "in_house", "providerName": None},
    ]
    linked = [{"pid": "e0e0e0e0-0000-4000-8000-000000000001", "name": "Holdout set", "componentType": "dataset",
               "objectName": "holdout.csv", "property": "hasTestingData"}]
    q = _qualification(systemComponents=rows, engineComponents=linked)
    q["risks"][0]["affected"] = "JobApplicant"  # a VAIR subject gives hasAISubject
    g = build_graph(q, EXTRACTED)
    used = {
        str(p).replace(AIRO, "") for p in set(g.predicates()) if str(p).startswith(AIRO)
    }
    assert used == set(PROPERTIES), set(PROPERTIES) - used


def test_an_unknown_affected_value_is_refused():
    q = _qualification()
    q["risks"][0]["affected"] = "subject"
    with pytest.raises(ValueError, match="affected"):
        build_graph(q)


def test_areas_of_impact_are_shared_across_risks_not_duplicated():
    """Two risk rows both citing "right" must point at ONE AreaOfImpact node, the
    same way both point at one User node. Anything else inflates the graph with
    copies of the same concept."""
    q = _qualification()
    q["risks"][1]["impactAreas"] = ["Right", "Safety"]  # row 0 also has "Right"
    g = build_graph(q)
    areas = list(g.subjects(RDF.type, _a("AreaOfImpact")))
    labels = sorted(str(g.value(a, RDFS.label)) for a in areas)
    assert labels == ["Right", "Safety"], labels
    # the edges are still per-risk: 1 + 2 = 3
    assert len(list(g.subject_objects(_a("hasImpactOnArea")))) == 3


# The label rule: names on nodes, prose in qual:text


def _labels(g):
    return {str(o) for _s, o in g.subject_objects(RDFS.label)}


def test_no_node_label_is_longer_than_sixty_characters():
    q = _qualification()
    q["targetUseCase"] = (
        "Retail banking and consumer micro-finance in the EU (deployed in Germany, "
        "France and the Netherlands). Evaluates creditworthiness for EUR 100 to 5,000 "
        "consumer loans and returns a 0-1000 score, a risk category and a "
        "recommendation, alongside influential factors and an explanation."
    )
    g = build_graph(q, EXTRACTED)
    too_long = {l for l in _labels(g) if len(l) > 60}
    assert too_long == set(), too_long


def test_the_full_text_is_kept_on_the_node_it_was_shortened_from():
    q = _qualification()
    long_purpose = "Evaluate creditworthiness. " * 10
    q["targetUseCase"] = long_purpose
    g = build_graph(q)
    purpose = next(g.subjects(RDF.type, _a("Purpose")))
    assert len(str(g.value(purpose, RDFS.label))) <= 60
    # whitespace is normalised, but not a character of content is dropped
    assert str(g.value(purpose, QUAL.fullLabel)) == " ".join(long_purpose.split())


def test_a_short_field_is_left_alone_with_no_redundant_text_copy():
    q = _qualification()
    q["targetUseCase"] = "Creditworthiness assessment"
    g = build_graph(q)
    purpose = next(g.subjects(RDF.type, _a("Purpose")))
    assert str(g.value(purpose, RDFS.label)) == "Creditworthiness assessment"
    assert g.value(purpose, QUAL.fullLabel) is None


def test_shortening_cuts_at_a_word_boundary_and_marks_the_cut():
    q = _qualification()
    q["targetUsers"] = (
        "Bank customers aged 18 and over applying through the portal, plus loan "
        "officers and compliance staff who review borderline cases"
    )
    g = build_graph(q)
    user = next(g.subjects(RDF.type, _a("AIUser")))
    label = str(g.value(user, RDFS.label))
    assert len(label) <= 60
    assert label.endswith("...")
    assert " ..." not in label  # no dangling space before the ellipsis
    assert not label[:-3].endswith(" ")


def test_risk_chain_nodes_are_shortened_too():
    q = _qualification()
    q["risks"][0]["control"] = (
        "Every Reject and every Review case goes to a trained loan officer before any "
        "decision reaches the applicant, and bureau coverage below the configured "
        "threshold forces the case into Review"
    )
    g = build_graph(q)
    controls = list(g.subjects(RDF.type, _a("RiskControl")))
    for c in controls:
        assert len(str(g.value(c, RDFS.label))) <= 60
    full = {str(o) for _s, o in g.subject_objects(QUAL.fullLabel)}
    assert any("bureau coverage below the configured threshold" in t for t in full)


def test_a_curated_name_beats_truncation():
    q = _qualification()
    q["targetUseCase"] = (
        "Retail banking and consumer micro-finance in the EU, evaluating "
        "creditworthiness for loans of EUR 100 to 5,000 and returning a score, a "
        "category and a recommendation"
    )
    g = build_graph(
        q,
        {**EXTRACTED, "names": {"purpose": "Creditworthiness assessment for consumer loans"}},
    )
    purpose = next(g.subjects(RDF.type, _a("Purpose")))
    assert str(g.value(purpose, RDFS.label)) == "Creditworthiness assessment for consumer loans"
    assert "EUR 100 to 5,000" in str(g.value(purpose, QUAL.fullLabel))


def test_curated_names_cover_the_prose_fed_nodes():
    q = _qualification()
    names = {
        "purpose": "Creditworthiness assessment",
        "users": "Bank customers and loan officers",
        "provider": "Creditum AI SARL",
        "deployer": "Retail banks in DE, FR and NL",
        "risk0": "Applicant wrongly ranked high risk",
        "risk0_source": "Thin bureau data",
        "risk0_consequence": "Creditworthy applicant refused",
        "risk0_control": "Officer review of every Reject",
    }
    g = build_graph(q, {**EXTRACTED, "names": names})
    labels = {str(o) for _s, o in g.subject_objects(RDFS.label)}
    for wanted in names.values():
        assert wanted in labels, wanted


def test_an_unknown_name_key_is_ignored_rather_than_crashing():
    g = build_graph(_qualification(), {"names": {"nonexistent_node": "Whatever"}})
    assert validate(g) == []


# The extracted shape the drafting prompt asks for


SKILL_SHAPED = {
    "techniques": [
        {"label": "Gradient-boosted decision tree", "vair": "MachineLearning"},
        {"label": "Policy eligibility rules", "vair": "LogicBasedTechnique"},
    ],
    "components": [
        {"label": "Scoring model", "vair": "Model"},
        {"label": "Policy-rule engine", "vair": "Algorithm"},
    ],
}


def test_extracted_accepts_the_label_plus_vair_objects_the_prompt_asks_for():
    g = build_graph(_qualification(), SKILL_SHAPED)
    labels = {str(o) for _s, o in g.subject_objects(RDFS.label)}
    assert "Gradient-boosted decision tree" in labels
    assert list(g.subjects(RDF.type, URIRef(VAIR + "MachineLearning")))
    assert list(g.subjects(RDF.type, URIRef(VAIR + "LogicBasedTechnique")))
    assert list(g.subjects(RDF.type, URIRef(VAIR + "Model")))
    assert list(g.subjects(RDF.type, URIRef(VAIR + "Algorithm")))
    assert validate(g) == []


def test_plain_strings_still_work_so_older_extractions_do_not_break():
    g = build_graph(_qualification(), EXTRACTED)
    sys_ = next(g.subjects(RDF.type, _a("AISystem")))
    assert len(list(g.objects(sys_, _a("usesTechnique")))) == 2
    assert validate(g) == []


def test_a_vair_term_that_is_not_a_real_term_is_refused():
    bad = {"techniques": [{"label": "Magic", "vair": "Telepathy"}]}
    with pytest.raises(ValueError, match="Telepathy"):
        build_graph(_qualification(), bad)


# Labels the builder generates itself must also be names


def test_the_impact_node_is_named_after_the_risk_not_prefixed_prose():
    q = _qualification()
    g = build_graph(q, {"names": {"risk0": "Applicant wrongly ranked high risk"}})
    impacts = [str(g.value(i, RDFS.label)) for i in g.subjects(RDF.type, _a("Impact"))]
    assert "Applicant wrongly ranked high risk" in " ".join(impacts)
    assert not any(l.startswith("Impact of:") for l in impacts)
    assert all(len(l) <= 60 for l in impacts)


def test_no_label_in_a_realistic_graph_ends_in_an_ellipsis():
    import json
    from pathlib import Path

    ex = Path(__file__).resolve().parents[1] / "examples"
    q = json.loads((ex / "mcas.qualification.json").read_text(encoding="utf-8"))
    extracted = json.loads((ex / "mcas.extracted.json").read_text(encoding="utf-8"))
    g = build_graph(q, extracted)
    truncated = {
        str(o) for _s, o in g.subject_objects(RDFS.label) if str(o).endswith("...")
    }
    assert truncated == set(), truncated


# Extracted.types: VAIR terms for nodes no mapping can reach


def test_types_map_assigns_vair_terms_to_risk_half_nodes():
    """The risk half has VAIR terms available (RiskSource 6, Consequence 7,
    Impact 6, RiskControl 11) but nothing mechanical can pick them: the choice
    comes from the risk row's text, so it arrives through `extracted`."""
    g = build_graph(
        _qualification(),
        {
            **EXTRACTED,
            "types": {
                "risk0_source": "DataRiskSource",
                "risk0_consequence": "DegradedAccuracy",
                "risk0_impact": "UnfavourableTreatment",
                "risk0_control": "ManualControl",
                "risk1_source": "Attack",
                "purpose": "Assessment",
                "system": "NarrowAI",
            },
        },
    )
    for term in (
        "DataRiskSource",
        "DegradedAccuracy",
        "UnfavourableTreatment",
        "ManualControl",
        "Attack",
        "Assessment",
        "NarrowAI",
    ):
        assert list(g.subjects(RDF.type, URIRef(VAIR + term))), term
    assert validate(g) == []


def test_a_typed_node_keeps_its_airo_class():
    g = build_graph(
        _qualification(), {"types": {"risk0_source": "DataRiskSource"}}
    )
    node = next(g.subjects(RDF.type, URIRef(VAIR + "DataRiskSource")))
    assert (node, RDF.type, _a("RiskSource")) in g


def test_a_types_entry_naming_an_invented_term_is_refused():
    with pytest.raises(ValueError, match="Telepathy"):
        build_graph(_qualification(), {"types": {"risk0_source": "Telepathy"}})


def test_a_types_entry_for_an_unknown_node_is_ignored():
    g = build_graph(_qualification(), {"types": {"no_such_node": "Attack"}})
    assert validate(g) == []


def test_a_types_entry_does_not_override_a_term_from_the_form():
    """A capability the author chose keeps its term: an empty types map changes nothing."""
    g = build_graph(_qualification(), {"types": {}})
    qa = list(g.subjects(RDF.type, URIRef(VAIR + "QuestionAnswering")))
    assert len(qa) == 1


EX = Namespace("https://lux-ai-factory.github.io/qualification/q/q123#")
LONG = "Assess the creditworthiness of consumer loan applicants for retail banks in Germany, France and the Netherlands"


def _drafted(of=LONG):
    return {"names": {"purpose": {"name": "Consumer credit assessment", "of": of}}}


def test_a_name_for_this_text_is_used_and_marked():
    q = {**_qualification(), "targetUseCase": LONG}
    g = build_graph(q, _drafted())
    assert str(g.value(EX.purpose, RDFS.label)) == "Consumer credit assessment"
    assert g.value(EX.purpose, QUAL.nameDrafted) is not None
    assert str(g.value(EX.purpose, QUAL.fullLabel)) == LONG
    assert node_view(g, EX.purpose)["nameDrafted"] is True


def test_a_name_for_this_text_ignores_whitespace_differences():
    q = {**_qualification(), "targetUseCase": LONG}
    g = build_graph(q, _drafted("  " + LONG.replace(" ", "  ") + "\n"))
    assert str(g.value(EX.purpose, RDFS.label)) == "Consumer credit assessment"


def test_a_name_for_other_text_is_ignored():
    q = {**_qualification(), "targetUseCase": LONG + " and Belgium"}
    g = build_graph(q, _drafted())
    assert str(g.value(EX.purpose, RDFS.label)).endswith("...")
    assert g.value(EX.purpose, QUAL.nameDrafted) is None
    assert "nameDrafted" not in node_view(g, EX.purpose)


def test_a_reviewed_label_is_no_longer_an_ai_name():
    q = {**_qualification(), "targetUseCase": LONG}
    g = build_graph(q, _drafted())
    apply_patch(g, {"purpose": {"label": "Credit scoring"}})
    assert str(g.value(EX.purpose, RDFS.label)) == "Credit scoring"
    assert g.value(EX.purpose, QUAL.nameDrafted) is None


def test_an_old_string_name_still_applies_and_is_not_marked_as_drafted():
    q = {**_qualification(), "targetUseCase": LONG}
    g = build_graph(q, {"names": {"purpose": "Consumer credit assessment"}})
    assert str(g.value(EX.purpose, RDFS.label)) == "Consumer credit assessment"
    assert str(g.value(EX.purpose, QUAL.provenance)) == "form"
    assert g.value(EX.purpose, QUAL.nameDrafted) is None


def _note(q, **over):
    return {"why": "the answer names a hosted LLM", "quote": "a hosted third-party LLM",
            "of": q["risks"][0]["control"], **over}


def test_a_note_rides_on_its_node():
    from rdflib import Literal
    q = _qualification()
    note = _note(q)
    g = build_graph(q, {"notes": {"risk0_control": [note]}})
    assert (EX.risk0_control, QUAL.reviewFlag, Literal("inconsistent")) in g
    assert node_view(g, EX.risk0_control)["flagNotes"] == [{"why": note["why"], "quote": note["quote"]}]


def test_a_note_for_other_text_is_ignored():
    q = _qualification()
    g = build_graph(q, {"notes": {"risk0_control": [_note(q, of="a control that is no longer there")]}})
    assert (EX.risk0_control, QUAL.reviewFlag, None) not in g
    assert (EX.risk0_control, QUAL.flagNote, None) not in g


def test_a_note_for_a_node_that_is_gone_is_ignored():
    q = _qualification()
    g = build_graph(q, {"notes": {"risk9_control": [_note(q)]}})
    assert (EX.risk9_control, None, None) not in g


def test_a_reviewer_edit_clears_the_notes_with_the_flag():
    q = _qualification()
    g = build_graph(q, {"notes": {"risk0_control": [_note(q)]}})
    apply_patch(g, {"risk0_control": {"label": "Manual review"}})
    assert (EX.risk0_control, QUAL.reviewFlag, None) not in g
    assert (EX.risk0_control, QUAL.flagNote, None) not in g
    assert "flagNotes" not in node_view(g, EX.risk0_control)


def test_a_note_keeps_a_separator_inside_its_reason_and_its_quote():
    q = _qualification()
    note = _note(q, why="says A | but B", quote="the model | is hosted")
    g = build_graph(q, {"notes": {"risk0_control": [note]}})
    assert node_view(g, EX.risk0_control)["flagNotes"] == [{"why": note["why"], "quote": note["quote"]}]


def test_a_node_with_an_ai_name_still_takes_a_note_for_the_authors_text():
    q = {**_qualification(), "targetUseCase": LONG}
    note = {"why": "w", "quote": "q", "of": LONG}
    g = build_graph(q, {**_drafted(), "notes": {"purpose": [note]}})
    assert str(g.value(EX.purpose, RDFS.label)) == "Consumer credit assessment"
    assert node_view(g, EX.purpose)["flagNotes"] == [{"why": "w", "quote": "q"}]


def test_a_note_missing_its_reason_is_refused():
    q = _qualification()
    with pytest.raises(ValueError):
        build_graph(q, {"notes": {"risk0_control": [{"quote": "q", "of": q["risks"][0]["control"]}]}})
