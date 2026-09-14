"""The deterministic checks, which run before the critic spends a call.

Each is a pure function over (draft, source text, term list). They are the part
of the workflow that must hold when the model misbehaves, so they are tested
without one.
"""
import pytest

from fill.controls import run_controls
from fill.models import Draft, Node

ANSWER = (
    "The scoring model is a gradient-boosted decision tree over 40 features. "
    "Policy eligibility rules are hand-written. Explanations come from a hosted "
    "LLM used as-is, grounded by a retrieval index over policy documents."
)
TERMS = ["DeepLearning", "KnowledgeBasedTechnique", "LogicBasedTechnique", "MachineLearning"]


def draft(*nodes: Node) -> Draft:
    return Draft(prop="techniques", nodes=nodes)


def flags(findings):
    return sorted({f.flag for f in findings})


class TestTermIsDefinedForTheClass:
    def test_a_term_outside_the_class_list_is_refused(self):
        d = draft(Node("technique0", "Gradient boosting", "Police", "AITechnique"))
        assert flags(run_controls(d, ANSWER, TERMS)) == ["unsupported-term"]

    def test_a_term_in_the_list_passes(self):
        d = draft(Node("technique0", "Gradient boosting", "MachineLearning", "AITechnique"))
        assert run_controls(d, ANSWER, TERMS) == []

    def test_a_node_with_no_term_is_not_a_term_problem(self):
        # Untyped is legitimate: VAIR may define nothing that fits.
        d = draft(Node("technique0", "Gradient boosting", None, "AITechnique"))
        assert flags(run_controls(d, ANSWER, TERMS)) == []


class TestLabelShape:
    def test_a_sentence_is_not_a_name(self):
        d = draft(
            Node(
                "technique0",
                "The system uses a gradient-boosted decision tree.",
                "MachineLearning",
                "AITechnique",
            )
        )
        assert "sentence" in flags(run_controls(d, ANSWER, TERMS))

    def test_a_label_over_sixty_characters_is_refused(self):
        d = draft(
            Node(
                "technique0",
                "Gradient boosted decision tree trained on forty applicant features",
                "MachineLearning",
                "AITechnique",
            )
        )
        assert "sentence" in flags(run_controls(d, ANSWER, TERMS))

    def test_a_noun_phrase_passes(self):
        d = draft(Node("technique0", "Gradient-boosted decision tree", "MachineLearning", "AITechnique"))
        assert run_controls(d, ANSWER, TERMS) == []


class TestGrounding:
    def test_a_label_whose_words_are_absent_from_the_answer_is_flagged(self):
        d = draft(Node("technique0", "Quantum annealing", "MachineLearning", "AITechnique"))
        assert "ungrounded" in flags(run_controls(d, ANSWER, TERMS))

    def test_a_label_lifted_from_the_answer_passes(self):
        d = draft(Node("technique0", "Retrieval index", "KnowledgeBasedTechnique", "AITechnique"))
        assert run_controls(d, ANSWER, TERMS) == []

    def test_one_shared_word_is_not_grounding(self):
        d = draft(Node("technique0", "Federated policy", "MachineLearning", "AITechnique"))
        assert "ungrounded" in flags(run_controls(d, ANSWER, TERMS))

    def test_a_different_inflection_still_counts_as_grounded(self):
        # The answer says "gradient-boosted"; the label says "boosting".
        d = draft(Node("technique0", "Gradient boosting", "MachineLearning", "AITechnique"))
        assert run_controls(d, ANSWER, TERMS) == []

    def test_recombination_is_left_to_the_critic(self):
        # Every word of "policy gradient" is in the answer, about other things.
        # No string comparison catches that; the reviewing pass does.
        d = draft(Node("technique0", "Policy gradient method", "MachineLearning", "AITechnique"))
        assert run_controls(d, ANSWER, TERMS) == []


class TestInflation:
    def test_more_nodes_than_the_cap_flags_the_surplus(self):
        # Distinct terms, so this isolates the cap from the duplicate rule.
        nodes = [
            Node(f"technique{i}", label, term, "AITechnique")
            for i, (label, term) in enumerate(
                [
                    ("Decision tree", "MachineLearning"),
                    ("Policy rules", "LogicBasedTechnique"),
                    ("Retrieval index", "KnowledgeBasedTechnique"),
                    ("Hosted LLM", "DeepLearning"),
                ]
            )
        ]
        findings = run_controls(draft(*nodes), ANSWER, TERMS)
        assert "inflated" in flags(findings)
        # the surplus is flagged, not the whole draft
        assert {f.node_id for f in findings if f.flag == "inflated"} == {"technique3"}

    def test_two_nodes_with_the_same_term_are_one_node(self):
        nodes = [
            Node("technique0", "Decision tree", "MachineLearning", "AITechnique"),
            Node("technique1", "Random forest", "MachineLearning", "AITechnique"),
        ]
        findings = run_controls(draft(*nodes), ANSWER, TERMS)
        assert "inflated" in flags(findings)
        assert {f.node_id for f in findings if f.flag == "inflated"} == {"technique1"}


class TestCoverage:
    def test_an_empty_draft_for_an_answer_that_says_something_is_flagged(self):
        findings = run_controls(draft(), ANSWER, TERMS)
        assert flags(findings) == ["uncovered"]
        assert findings[0].node_id == "techniques"

    def test_an_empty_draft_for_an_empty_answer_is_fine(self):
        assert run_controls(draft(), "", TERMS) == []


class TestEveryFindingIsPublishable:
    def test_each_flag_is_one_the_builder_accepts(self):
        # The builder refuses a flag outside its closed set, so a control that
        # invents one would make the draft unpublishable.
        import sys
        from pathlib import Path

        sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "ontology"))
        from airo_min.build import REVIEW_FLAGS

        bad = draft(
            Node("technique0", "The system uses quantum annealing for everything.", "Police", "AITechnique"),
            Node("technique1", "Quantum annealing", "Police", "AITechnique"),
            Node("technique2", "Quantum annealing", "Police", "AITechnique"),
            Node("technique3", "Quantum annealing", "Police", "AITechnique"),
        )
        found = run_controls(bad, ANSWER, TERMS)
        assert found
        for finding in found:
            assert finding.flag in REVIEW_FLAGS
            assert finding.source == "control"
            assert finding.detail
