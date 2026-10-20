"""The review rounds and the four ways they end.

Every exit publishes. These are the rules that have to hold when the model
misbehaves, so they are exercised with scripted completions and no model: a
writer that repeats itself, a reviewer that never relents, a model that answers
prose.
"""
import json

import pytest

from fill.workflow import FillRun

ANSWER_2A = (
    "A gradient-boosted decision tree over 40 applicant features, with "
    "hand-written policy eligibility rules."
)

QUALIFICATION = {
    "id": "q1",
    "answers": [{"toolId": "annex-2", "questionId": "2a", "answer": ANSWER_2A}],
}
TERMS = {"AITechnique": ["MachineLearning", "LogicBasedTechnique"], "AIComponent": ["Model"]}

GOOD_DRAFT = json.dumps(
    {
        "nodes": [
            {"label": "Gradient-boosted decision tree", "vair": "MachineLearning"},
            {"label": "Policy eligibility rules", "vair": "LogicBasedTechnique"},
        ]
    }
)
UNGROUNDED_DRAFT = json.dumps(
    {"nodes": [{"label": "Quantum annealing", "vair": "MachineLearning"}]}
)


def scripted(*replies: str):
    """A completer that answers each call in turn, repeating the last."""
    calls = {"n": 0}

    def complete(system: str, user: str, temperature: float = 0.0) -> str:
        i = calls["n"]
        calls["n"] += 1
        return replies[min(i, len(replies) - 1)]

    complete.calls = calls  # type: ignore[attr-defined]
    return complete


def run_one(complete, max_rounds: int = 3) -> FillRun:
    """Drive one property to its stopping rule."""
    run = FillRun(
        qualification=QUALIFICATION,
        terms=TERMS,
        complete=complete,
        publish=lambda qid, payload: None,
        max_rounds=max_rounds,
    )
    run.load()
    run.draft()
    run.review()
    while run.needs_revision():
        run.revise()
        run.review()
    run.finish_property()
    return run


class TestClean:
    def test_a_draft_nobody_objects_to_stops_after_one_round(self):
        run = run_one(scripted(GOOD_DRAFT, '{"findings": []}'))
        assert run.outcomes["techniques"].stop == "clean"
        assert len(run.outcomes["techniques"].rounds) == 1
        assert run.outcomes["techniques"].open_findings == ()


class TestFixpoint:
    def test_the_same_objection_twice_running_stops_the_loop(self):
        # The writer will not fix what the reviewer will not drop: a third
        # attempt is a person's decision, not another call.
        run = run_one(scripted(UNGROUNDED_DRAFT))
        outcome = run.outcomes["techniques"]
        assert outcome.stop == "fixpoint"
        assert len(outcome.rounds) == 2
        assert [f.flag for f in outcome.open_findings] == ["ungrounded"]


class TestCap:
    def test_new_objections_every_round_stop_at_the_cap(self):
        # Each round adds another ungrounded node, so the findings genuinely
        # differ. Re-flagging the same node with the same flag would be a
        # fixpoint, which stops earlier and is tested above.
        drafts = [
            json.dumps(
                {
                    "nodes": [
                        {"label": f"Quantum annealing {n}", "vair": "MachineLearning"}
                        for n in range(i + 1)
                    ]
                }
            )
            for i in range(6)
        ]
        run = run_one(scripted(*drafts), max_rounds=3)
        outcome = run.outcomes["techniques"]
        assert outcome.stop == "cap"
        assert len(outcome.rounds) == 3

    @pytest.mark.parametrize("cap", [1, 2, 3, 5])
    def test_it_never_runs_longer_than_the_cap(self, cap):
        drafts = [
            json.dumps({"nodes": [{"label": f"Quantum annealing {i}", "vair": "MachineLearning"}]})
            for i in range(20)
        ]
        run = run_one(scripted(*drafts), max_rounds=cap)
        assert len(run.outcomes["techniques"].rounds) <= cap


class TestEveryExitPublishes:
    @pytest.mark.parametrize(
        "complete",
        [
            scripted(GOOD_DRAFT, '{"findings": []}'),
            scripted(UNGROUNDED_DRAFT),
            scripted("I would rather not."),
        ],
    )
    def test_a_draft_is_always_recorded(self, complete):
        run = run_one(complete)
        assert "techniques" in run.outcomes, "a failed review must not lose the work"


class TestControlsComeFirst:
    def test_a_control_finding_costs_no_review_call(self):
        # Cheapest first: a draft that cannot be written is not worth judgement.
        bad_term = json.dumps({"nodes": [{"label": "Decision tree", "vair": "Police"}]})
        complete = scripted(bad_term)
        run_one(complete)
        # one draft call per round, and no reviewer call at all
        assert complete.calls["n"] <= 3

    def test_an_empty_answer_is_not_a_coverage_finding(self):
        run = FillRun(
            qualification={"id": "q1", "answers": []},
            terms=TERMS,
            complete=scripted('{"nodes": []}', '{"findings": []}'),
            publish=lambda qid, payload: None,
        )
        run.load()
        run.draft()
        run.review()
        assert run.findings == []


class TestRevisionCanAddAsWellAsReplace:
    """`uncovered` says a node is missing, so a revision has to be able to add.

    Revision replaced nodes by id and dropped anything new, which meant the one
    finding whose remedy is a new node could never be resolved: the reviewer
    asked, the writer complied, and the answer was thrown away.
    """

    def test_a_node_the_writer_adds_in_revision_is_kept(self):
        from fill.models import Finding

        first = json.dumps({"nodes": [{"label": "Policy eligibility rules", "vair": "LogicBasedTechnique"}]})
        second = json.dumps(
            {
                "nodes": [
                    {"label": "Policy eligibility rules", "vair": "LogicBasedTechnique"},
                    {"label": "Gradient-boosted decision tree", "vair": "MachineLearning"},
                ]
            }
        )
        run = FillRun(
            qualification=QUALIFICATION,
            terms=TERMS,
            complete=scripted(first, '{"findings": []}', second, '{"findings": []}'),
            publish=lambda qid, payload: None,
        )
        run.load()
        run.draft()
        run.review()
        run.findings = [
            Finding("techniques", "uncovered", "the decision tree is missing", "critic")
        ]
        run.revise()
        labels = [n.label for n in run.draft_in_hand.nodes]
        assert "Gradient-boosted decision tree" in labels
        assert "Policy eligibility rules" in labels

    def test_an_added_node_keeps_a_stable_id(self):
        first = json.dumps({"nodes": [{"label": "Policy eligibility rules", "vair": "LogicBasedTechnique"}]})
        second = json.dumps(
            {
                "nodes": [
                    {"label": "Policy eligibility rules", "vair": "LogicBasedTechnique"},
                    {"label": "Gradient-boosted decision tree", "vair": "MachineLearning"},
                ]
            }
        )
        run = FillRun(
            qualification=QUALIFICATION,
            terms=TERMS,
            complete=scripted(first, '{"findings": []}', second, '{"findings": []}'),
            publish=lambda qid, payload: None,
        )
        run.load()
        run.draft()
        run.review()
        run.revise()
        ids = [n.id for n in run.draft_in_hand.nodes]
        assert ids == sorted(set(ids)), "ids must stay unique and ordered"


class TestRevisionReplacesTheDraft:
    """A revision is the whole list again, so a node can be fixed in place or removed.

    Merging the revision by positional id overwrote the wrong node when the writer re-proposed only
    the flagged one, and never removed anything, so `inflated` could not be resolved.
    """

    FOUR = (
        "A gradient-boosted decision tree, hand-written policy eligibility rules, "
        "a logistic regression scorecard and a recurrent neural network."
    )
    TERMS4 = {"AITechnique": ["MachineLearning", "LogicBasedTechnique", "Regression", "NeuralNetwork"]}

    def _run(self, answer, complete):
        return FillRun(
            qualification={"id": "q1", "answers": [{"toolId": "annex-2", "questionId": "2a", "answer": answer}]},
            terms=self.TERMS4,
            complete=complete,
            publish=lambda qid, payload: None,
        )

    def test_an_inflated_draft_loses_the_surplus_node_and_ends_clean(self):
        four = json.dumps({"nodes": [
            {"label": "Gradient-boosted decision tree", "vair": "MachineLearning"},
            {"label": "Policy eligibility rules", "vair": "LogicBasedTechnique"},
            {"label": "Logistic regression scorecard", "vair": "Regression"},
            {"label": "Recurrent neural network", "vair": "NeuralNetwork"},
        ]})
        three = json.dumps({"nodes": json.loads(four)["nodes"][:3]})
        run = self._run(self.FOUR, scripted(four, three, '{"findings": []}'))
        run.load()
        run.draft()
        run.review()
        assert [(f.node_id, f.flag) for f in run.findings] == [("technique3", "inflated")]
        while run.needs_revision():
            run.revise()
            run.review()
        run.finish_property()
        outcome = run.outcomes["techniques"]
        assert [n.label for n in outcome.draft.nodes] == [
            "Gradient-boosted decision tree", "Policy eligibility rules", "Logistic regression scorecard"]
        assert outcome.stop == "clean"

    def test_the_flagged_node_is_replaced_and_the_writer_sees_the_draft_it_revises(self):
        answer = "A gradient-boosted decision tree, checked against a random forest ensemble."
        first = json.dumps({"nodes": [
            {"label": "Gradient-boosted decision tree", "vair": "MachineLearning"},
            {"label": "Quantum annealing solver", "vair": "Regression"},
        ]})
        fixed = json.dumps({"nodes": [
            {"label": "Gradient-boosted decision tree", "vair": "MachineLearning"},
            {"label": "Random forest ensemble", "vair": "Regression"},
        ]})
        prompts = []
        replies = iter([first, fixed, '{"findings": []}'])

        def complete(system, user, *a, **k):
            prompts.append(user)
            return next(replies)

        run = self._run(answer, complete)
        run.load()
        run.draft()
        run.review()
        assert [(f.node_id, f.flag) for f in run.findings] == [("technique1", "ungrounded")]
        run.revise()
        assert [n.label for n in run.draft_in_hand.nodes] == ["Gradient-boosted decision tree", "Random forest ensemble"]
        revise_prompt = prompts[1]
        assert "technique0: Gradient-boosted decision tree" in revise_prompt
        assert "technique1: Quantum annealing solver" in revise_prompt
        assert "whole list" in revise_prompt

    def _revised_after(self, revision):
        answer = "A gradient-boosted decision tree, checked against a random forest ensemble."
        first = json.dumps({"nodes": [
            {"label": "Gradient-boosted decision tree", "vair": "MachineLearning"},
            {"label": "Quantum annealing solver", "vair": "Regression"},
        ]})
        run = self._run(answer, scripted(first, revision, '{"findings": []}'))
        run.load()
        run.draft()
        run.review()
        assert run.findings, "the second node must be flagged for a revision to happen"
        run.revise()
        return [n.label for n in run.draft_in_hand.nodes]

    def test_a_revision_answer_with_no_node_list_keeps_the_draft(self):
        """Prose, or a reply cut at the token limit, is no answer: the earlier rounds' nodes stay."""
        kept = ["Gradient-boosted decision tree", "Quantum annealing solver"]
        assert self._revised_after("sorry, I cannot") == kept
        assert self._revised_after('{"nodes": [{"label": "Gradient') == kept
        assert self._revised_after('{"answer": "none"}') == kept

    def test_an_explicit_empty_node_list_still_replaces_the_draft(self):
        assert self._revised_after('{"nodes": []}') == []

    def test_a_writer_that_answers_only_the_fixed_node_does_not_keep_the_flagged_one(self):
        answer = "A gradient-boosted decision tree, checked against a random forest ensemble."
        first = json.dumps({"nodes": [
            {"label": "Gradient-boosted decision tree", "vair": "MachineLearning"},
            {"label": "Quantum annealing solver", "vair": "Regression"},
        ]})
        only_fixed = json.dumps({"nodes": [{"label": "Random forest ensemble", "vair": "Regression"}]})
        run = self._run(answer, scripted(first, only_fixed, '{"findings": []}'))
        run.load()
        run.draft()
        run.review()
        run.revise()
        labels = [n.label for n in run.draft_in_hand.nodes]
        assert "Quantum annealing solver" not in labels
        assert labels == ["Random forest ensemble"]
