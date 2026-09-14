"""The view model: what the card renders, and what an edit changes.

Python computes the view so the frontend needs no RDF library. Every node carries
its provenance, so a generated claim is distinguishable from a reviewed one.
"""
import json
from pathlib import Path

from rdflib import RDF, RDFS, URIRef
import pytest

from airo_min.build import QUAL, build_graph
from airo_min.patch import apply_patch
from airo_min.schema import AIRO
from airo_min.validate import validate
from airo_min.view import build_view

EXAMPLES = Path(__file__).resolve().parents[1] / "examples"
VAIR = "https://w3id.org/vair#"


@pytest.fixture(scope="module")
def parts():
    q = json.loads((EXAMPLES / "mcas.qualification.json").read_text(encoding="utf-8"))
    e = json.loads((EXAMPLES / "mcas.extracted.json").read_text(encoding="utf-8"))
    return q, e


@pytest.fixture
def graph(parts):
    q, e = parts
    return build_graph(q, e)


# ── provenance is stamped at build time ─────────────────────────────────────


def test_form_fed_nodes_are_marked_as_coming_from_the_form(graph):
    purpose = next(graph.subjects(RDF.type, URIRef(AIRO + "Purpose")))
    assert str(graph.value(purpose, QUAL.provenance)) == "form"


def test_prose_fed_nodes_are_marked_as_extracted(graph):
    tech = next(graph.subjects(RDF.type, URIRef(AIRO + "AITechnique")))
    assert str(graph.value(tech, QUAL.provenance)) == "extracted"


# ── the patch layer ─────────────────────────────────────────────────────────


def test_a_patch_changes_the_label_and_marks_the_node_reviewed(graph):
    apply_patch(graph, {"purpose": {"label": "Consumer credit scoring"}})
    purpose = next(graph.subjects(RDF.type, URIRef(AIRO + "Purpose")))
    assert str(graph.value(purpose, RDFS.label)) == "Consumer credit scoring"
    assert str(graph.value(purpose, QUAL.provenance)) == "reviewed"


def test_the_generated_label_is_never_lost(graph):
    before = str(
        graph.value(next(graph.subjects(RDF.type, URIRef(AIRO + "Purpose"))), RDFS.label)
    )
    apply_patch(graph, {"purpose": {"label": "Consumer credit scoring"}})
    purpose = next(graph.subjects(RDF.type, URIRef(AIRO + "Purpose")))
    assert str(graph.value(purpose, QUAL.generatedLabel)) == before


def test_a_patch_can_assign_the_vair_type_the_mapping_would_not(graph):
    scoring = [
        s
        for s in graph.subjects(RDF.type, URIRef(AIRO + "AICapability"))
        if "Risk Scoring" in str(graph.value(s, RDFS.label))
    ][0]
    node_id = str(scoring).rsplit("#", 1)[1]
    apply_patch(
        graph,
        {node_id: {"vair": "Profiling", "note": "profiling per Art 3(4), not social scoring"}},
    )
    assert (scoring, RDF.type, URIRef(VAIR + "Profiling")) in graph
    assert "Art 3(4)" in str(graph.value(scoring, QUAL.reviewNote))
    assert validate(graph) == []


def test_a_patch_can_remove_a_wrong_vair_type(graph):
    tech = [
        s
        for s in graph.subjects(RDF.type, URIRef(VAIR + "MachineLearning"))
    ][0]
    node_id = str(tech).rsplit("#", 1)[1]
    apply_patch(graph, {node_id: {"vair": None}})
    assert (tech, RDF.type, URIRef(VAIR + "MachineLearning")) not in graph
    assert (tech, RDF.type, URIRef(AIRO + "AITechnique")) in graph


def test_a_patch_cannot_invent_a_vair_term(graph):
    with pytest.raises(ValueError, match="Telepathy"):
        apply_patch(graph, {"purpose": {"vair": "Telepathy"}})


def test_a_patch_for_an_unknown_node_is_ignored(graph):
    apply_patch(graph, {"no_such_node": {"label": "x"}})
    assert validate(graph) == []


def test_a_patch_cannot_change_the_airo_class(graph):
    with pytest.raises(ValueError, match="class"):
        apply_patch(graph, {"purpose": {"cls": "Risk"}})


# ── the view model ──────────────────────────────────────────────────────────


def test_the_view_has_a_system_half_and_a_risk_half(graph):
    view = build_view(graph)
    assert view["system"]["label"].startswith("MicroCredit Assist Score")
    assert len(view["rows"]) >= 8
    assert len(view["chains"]) == 5


def test_each_system_row_names_its_property_and_its_ai_act_citation(graph):
    view = build_view(graph)
    by_prop = {r["property"]: r for r in view["rows"]}
    assert by_prop["hasPurpose"]["citation"].startswith("Art 3(12)")
    assert by_prop["isUsedWithinLocality"]["citation"].startswith("Art 3(44)")
    assert by_prop["hasCapability"]["nodes"][0]["label"]
    for row in view["rows"]:
        assert row["citation"], row["property"]


def test_each_node_in_the_view_carries_what_the_ui_needs(graph):
    view = build_view(graph)
    node = view["rows"][0]["nodes"][0]
    assert set(node) >= {"id", "label", "cls", "vair", "fullText", "provenance"}


def test_a_chain_is_the_whole_risk_path_in_order(graph):
    view = build_view(graph)
    chain = view["chains"][1]  # the fairness risk: no vulnerability, has a follow-up
    assert chain["risk"]["label"] == "Approval rates diverge across groups"
    assert chain["source"]["label"] == "Postal-code features as a proxy"
    assert chain["vulnerability"] is None
    assert chain["consequence"]["label"] == "Discriminatory treatment by area"
    assert chain["stakeholder"]["cls"] == "AIUser"
    assert [a["label"] for a in chain["areas"]] == ["Fundamental rights", "Freedom"]
    assert chain["control"]["label"] == "Quarterly fairness audit, 5% band"
    assert chain["followUp"]["label"] == "Suspend scoring for the market"


def test_the_only_untyped_nodes_left_are_ones_vair_cannot_type(graph):
    """After the curated types map, an untyped node means the vocabulary has
    nothing to offer for that class, not that someone forgot."""
    view = build_view(graph)
    untyped_classes = {
        n["cls"]
        for r in view["rows"]
        for n in r["nodes"]
        if n["vair"] is None
    }
    for c in view["chains"]:
        for key in ("risk", "source", "vulnerability", "consequence", "impact",
                    "stakeholder", "control", "followUp"):
            n = c[key]
            if n and n["vair"] is None:
                untyped_classes.add(n["cls"])
    # Risk, Vulnerability and AIUser have zero VAIR specialisations; AIOperator's
    # 17 terms are Annex III public bodies, none of which is a commercial bank.
    assert untyped_classes <= {"Risk", "Vulnerability", "AIUser", "AIOperator"}, (
        untyped_classes
    )


def test_a_reviewed_node_shows_as_reviewed_in_the_view(graph):
    apply_patch(graph, {"purpose": {"label": "Consumer credit scoring"}})
    view = build_view(graph)
    purpose = [
        n for r in view["rows"] if r["property"] == "hasPurpose" for n in r["nodes"]
    ][0]
    assert purpose["provenance"] == "reviewed"
    assert purpose["generatedLabel"]


def test_the_view_reports_the_counts_the_card_header_shows(graph):
    view = build_view(graph)
    assert view["counts"]["nodes"] == 59
    assert view["counts"]["triples"] == len(graph)
    assert view["counts"]["risks"] == 5


def test_the_view_is_json_serialisable(graph):
    json.dumps(build_view(graph))


def test_the_counts_separate_a_missing_term_from_an_impossible_one(graph):
    """"12 nodes have no term" would be misleading when none of them can be
    typed. The card needs the number a reviewer can act on."""
    counts = build_view(graph)["counts"]
    # Nothing here is a gap: Risk, Vulnerability and AIUser have no VAIR terms
    # at all, and the two operators are a commercial provider and retail banks,
    # which VAIR's public-body operator terms do not cover.
    assert counts["needsTerm"] == 0
    assert counts["unclassifiable"] == 12
    assert counts["needsTerm"] + counts["unclassifiable"] == counts["untyped"]


class TestPartialVocabularies:
    """A VAIR vocabulary can cover one population rather than the whole class.

    All 17 AIOperator terms are Annex III public bodies: authorities, EU bodies,
    judicial and law-enforcement agents, education and vocational training
    providers. A commercial provider or a retail bank therefore has no term to
    take. The card used to flag both as "no term", which reads as a gap someone
    could close by picking from the list; it cannot be closed, because the term
    does not exist.
    """

    def test_the_operator_vocabulary_is_marked_partial(self):
        from airo_min.view import PARTIAL_VOCABULARIES

        assert "AIOperator" in PARTIAL_VOCABULARIES
        # Purpose and Capability describe any system, so a gap there is real.
        assert "Purpose" not in PARTIAL_VOCABULARIES
        assert "AICapability" not in PARTIAL_VOCABULARIES

    def test_an_untyped_operator_is_not_asked_for_a_term(self, graph):
        view = build_view(graph)
        operators = [
            n
            for row in view["rows"]
            for n in row["nodes"]
            if n["cls"] == "AIOperator" and n["vair"] is None
        ]
        assert len(operators) == 2, [n["label"] for n in operators]
        for node in operators:
            assert node["termExpected"] is False

    def test_a_class_vair_cannot_type_at_all_says_so_too(self, graph):
        """One flag for every node no term can describe, whatever the reason.

        The PDF has no vocabulary to consult, so "does this node want a term?"
        has to travel with the node, not be inferred from an empty list.
        """
        view = build_view(graph)
        risks = [c["risk"] for c in view["chains"]]
        assert risks
        for risk in risks:
            assert risk["vair"] is None
            assert risk["termExpected"] is False

    def test_a_class_vair_covers_fully_still_expects_a_term(self, graph):
        apply_patch(graph, {"purpose": {"vair": None}})
        view = build_view(graph)
        purpose = [
            n for r in view["rows"] if r["property"] == "hasPurpose" for n in r["nodes"]
        ][0]
        assert purpose["vair"] is None
        assert purpose.get("termExpected", True) is True
        assert build_view(graph)["counts"]["needsTerm"] == 1

    def test_an_operator_can_still_be_typed_when_it_is_a_public_body(self, graph):
        # A deployer that IS an authority should carry the term; only the
        # absence stops being a defect.
        apply_patch(graph, {"deployer": {"vair": "PublicAuthority"}})
        view = build_view(graph)
        deployer = [
            n
            for r in view["rows"]
            if r["property"] == "isDeployedBy"
            for n in r["nodes"]
        ][0]
        assert deployer["vair"] == "PublicAuthority"


# ── "no term applies": a reviewer's judgment, recorded ──────────────────────


def test_a_reviewer_can_record_that_no_term_applies(graph):
    """VAIR's 17 AIOperator terms are all Annex III public bodies, so a
    commercial provider has no term to take. Without a way to say so, the node
    stays flagged as needing something that cannot exist."""
    apply_patch(graph, {"provider": {"termNotApplicable": True}})
    provider = next(
        s
        for s in graph.subjects(RDF.type, URIRef(AIRO + "AIOperator"))
        if "Creditum" in str(graph.value(s, RDFS.label))
    )
    assert str(graph.value(provider, QUAL.termNotApplicable)) == "true"
    assert str(graph.value(provider, QUAL.provenance)) == "reviewed"
    assert validate(graph) == []


def test_marking_it_not_applicable_takes_it_out_of_the_reviewer_queue(graph):
    # Emptied first, because nothing in the built graph is in the queue: the
    # classes that stay untyped are the ones no term can describe.
    apply_patch(graph, {"purpose": {"vair": None}})
    before = build_view(graph)["counts"]["needsTerm"]
    assert before == 1
    apply_patch(graph, {"purpose": {"termNotApplicable": True}})
    after = build_view(graph)["counts"]["needsTerm"]
    assert after == before - 1


def test_the_view_tells_the_ui_not_to_flag_it(graph):
    apply_patch(
        graph,
        {"provider": {"termNotApplicable": True, "note": "VAIR names only public bodies"}},
    )
    view = build_view(graph)
    provider = [
        n for r in view["rows"] if r["property"] == "isProvidedBy" for n in r["nodes"]
    ][0]
    assert provider["termNotApplicable"] is True
    assert "public bodies" in provider["reviewNote"]


def test_clearing_the_mark_puts_it_back_in_the_queue(graph):
    # On a class whose terms do describe it: an operator never joins the queue,
    # because VAIR's operator terms name public bodies only.
    apply_patch(graph, {"purpose": {"vair": None, "termNotApplicable": True}})
    marked = build_view(graph)["counts"]["needsTerm"]
    apply_patch(graph, {"purpose": {"termNotApplicable": False}})
    assert build_view(graph)["counts"]["needsTerm"] == marked + 1


def test_assigning_a_real_term_clears_the_mark(graph):
    apply_patch(graph, {"provider": {"termNotApplicable": True}})
    apply_patch(graph, {"provider": {"vair": "PublicAuthority"}})
    provider = next(graph.subjects(RDF.type, URIRef(VAIR + "PublicAuthority")))
    assert graph.value(provider, QUAL.termNotApplicable) is None


class TestReviewFlags:
    """A draft written by the filler agent arrives with its own review findings
    attached, so the card can show what the agent itself was unsure about.

    The flags live on the node, beside its provenance, because that is where the
    person who clears them is looking. Clearing one is an edit: the patch stamps
    the node reviewed, and the flag goes with it.
    """

    def test_a_flag_reaches_the_view(self, parts):
        q, e = parts
        graph = build_graph(q, dict(e, flags={"technique0": ["ungrounded"]}))
        view = build_view(graph)
        techniques = [
            n for r in view["rows"] if r["property"] == "usesTechnique" for n in r["nodes"]
        ]
        flagged = [n for n in techniques if n.get("flags")]
        assert len(flagged) == 1
        assert flagged[0]["flags"] == ["ungrounded"]

    def test_several_flags_on_one_node_keep_their_order(self, parts):
        q, e = parts
        graph = build_graph(
            q, dict(e, flags={"component0": ["inflated", "sentence"]})
        )
        view = build_view(graph)
        node = next(
            n
            for r in view["rows"]
            if r["property"] == "hasComponent"
            for n in r["nodes"]
            if n["id"] == "component0"
        )
        assert node["flags"] == ["inflated", "sentence"]

    def test_an_unflagged_node_carries_no_flag_key(self, parts):
        q, e = parts
        view = build_view(build_graph(q, e))
        purpose = [
            n for r in view["rows"] if r["property"] == "hasPurpose" for n in r["nodes"]
        ][0]
        assert "flags" not in purpose

    def test_the_counts_say_how_many_nodes_are_flagged(self, parts):
        q, e = parts
        graph = build_graph(
            q, dict(e, flags={"technique0": ["ungrounded"], "component1": ["inflated"]})
        )
        assert build_view(graph)["counts"]["flagged"] == 2

    def test_a_flag_on_a_node_that_no_longer_exists_is_ignored(self, parts):
        q, e = parts
        graph = build_graph(q, dict(e, flags={"technique99": ["ungrounded"]}))
        assert build_view(graph)["counts"]["flagged"] == 0

    def test_reviewing_a_node_clears_its_flags(self, parts):
        q, e = parts
        graph = build_graph(q, dict(e, flags={"technique0": ["ungrounded"]}))
        apply_patch(graph, {"technique0": {"label": "Gradient boosting"}})
        view = build_view(graph)
        node = next(
            n
            for r in view["rows"]
            if r["property"] == "usesTechnique"
            for n in r["nodes"]
            if n["id"] == "technique0"
        )
        assert node["provenance"] == "reviewed"
        assert "flags" not in node
        assert build_view(graph)["counts"]["flagged"] == 0

    def test_an_unknown_flag_is_refused(self, parts):
        q, e = parts
        with pytest.raises(ValueError, match="not a review flag"):
            build_graph(q, dict(e, flags={"technique0": ["looks-wrong"]}))

    def test_the_graph_is_still_valid_airo_with_flags(self, parts):
        q, e = parts
        graph = build_graph(q, dict(e, flags={"technique0": ["ungrounded"]}))
        assert validate(graph) == []
