"""The BAF state machine: its states, its transitions, and one run end to end.

The flow is the product here, so its shape is asserted rather than described.
The run uses a fake completer and a fake publisher, so it exercises the real
states and the real controls with no network and no model.
"""
import pytest

baf = pytest.importorskip("baf", reason="BAF is not installed in this environment")

from fill.workflow import STATE_NAMES, build_agent, run_fill
from fill.models import PROPERTIES


QUALIFICATION = {
    "id": "q1",
    "systemName": "MicroCredit Assist Score",
    "systemVersion": "v1.2.0",
    "answers": [
        {
            "toolId": "annex-2",
            "questionId": "2a",
            "answer": (
                "A gradient-boosted decision tree over 40 applicant features, with "
                "hand-written policy eligibility rules."
            ),
        },
        {
            "toolId": "annex-2",
            "questionId": "2c",
            "answer": "A scoring model, a policy rule engine and a hosted explanation LLM.",
        },
    ],
    "risks": [],
}

TERMS = {
    "AITechnique": ["MachineLearning", "LogicBasedTechnique", "KnowledgeBasedTechnique"],
    "AIComponent": ["Model", "Algorithm", "Tool", "TrainedModel"],
}


class FakeCompleter:
    """A writer that drafts from the answer, and a critic that never objects."""

    def __init__(self):
        self.calls = 0

    def __call__(self, system: str, user: str, temperature: float = 0.0) -> str:
        self.calls += 1
        if "reviewing" in system.lower() or "review" in system[:200].lower():
            return '{"findings": []}'
        if "Property: techniques" in user:
            return (
                '{"nodes": [{"label": "Gradient-boosted decision tree", "vair": "MachineLearning"},'
                ' {"label": "Policy eligibility rules", "vair": "LogicBasedTechnique"}]}'
            )
        return (
            '{"nodes": [{"label": "Scoring model", "vair": "Model"},'
            ' {"label": "Policy rule engine", "vair": "Algorithm"},'
            ' {"label": "Hosted explanation LLM", "vair": "Tool"}]}'
        )


class TestTheStateMachine:
    def test_it_has_the_states_the_workflow_describes(self):
        agent = build_agent()
        names = [s.name for s in agent.states]
        assert names == list(STATE_NAMES)

    def test_it_starts_where_the_work_starts(self):
        agent = build_agent()
        initial = [s.name for s in agent.states if s.initial]
        assert initial == ["load"]

    def test_every_state_has_a_body_of_its_own(self):
        # A state left with BAF's default body is a dead end that looks like a
        # step. `state.body` is BAF's decorator and always exists, so asserting
        # on it proves nothing; the stored callable is `_body`.
        from baf.core.state import State

        for state in build_agent().states:
            assert state._body.__name__.endswith("_body"), state.name
            assert state._body is not State.__init__.__defaults__, state.name

    def test_every_state_but_the_last_can_leave(self):
        agent = build_agent()
        for state in agent.states:
            if state.name == "done":
                continue
            assert state.transitions, f"{state.name} has no way out"


class TestARunEndToEnd:
    def test_it_drafts_every_property_and_publishes_once(self):
        published = {}
        result = run_fill(
            QUALIFICATION,
            terms=TERMS,
            complete=FakeCompleter(),
            publish=lambda qid, payload: published.setdefault(qid, payload),
        )
        assert set(published) == {"q1"}
        payload = published["q1"]
        assert [n["label"] for n in payload["techniques"]] == [
            "Gradient-boosted decision tree",
            "Policy eligibility rules",
        ]
        assert len(payload["components"]) == 3
        assert result.stop_reasons["techniques"] == "clean"

    def test_a_clean_run_publishes_no_flags(self):
        published = {}
        run_fill(
            QUALIFICATION,
            terms=TERMS,
            complete=FakeCompleter(),
            publish=lambda qid, payload: published.setdefault(qid, payload),
        )
        assert published["q1"]["flags"] == {}

    def test_findings_that_survive_review_are_published_as_flags(self):
        def stubborn(system: str, user: str, temperature: float = 0.0) -> str:
            if "Property:" in user and "The draft:" not in user:
                return '{"nodes": [{"label": "Quantum annealing", "vair": "MachineLearning"}]}'
            return '{"findings": []}'

        published = {}
        result = run_fill(
            QUALIFICATION,
            terms=TERMS,
            complete=stubborn,
            publish=lambda qid, payload: published.setdefault(qid, payload),
        )
        flags = published["q1"]["flags"]
        assert flags, "an ungrounded label must reach the user flagged"
        assert "ungrounded" in next(iter(flags.values()))
        assert result.stop_reasons["techniques"] == "fixpoint"

    def test_the_record_says_what_it_cost(self):
        result = run_fill(
            QUALIFICATION, terms=TERMS, complete=FakeCompleter(), publish=lambda q, p: None
        )
        assert set(result.stop_reasons) == set(PROPERTIES) - {"risk_types"}
        assert result.calls > 0
        assert result.rounds >= len(result.stop_reasons)

    def test_it_publishes_even_when_the_model_answers_nonsense(self):
        published = {}
        run_fill(
            QUALIFICATION,
            terms=TERMS,
            complete=lambda system, user, temperature=0.0: "I would rather not.",
            publish=lambda qid, payload: published.setdefault(qid, payload),
        )
        # Nothing drafted, so the run still publishes: an empty draft, and the
        # coverage finding in the record. It cannot be a node flag, because the
        # finding is that there is no node.
        assert published["q1"]["techniques"] == []
        assert published["q1"]["flags"] == {}
        unattached = published["q1"]["record"]["unattached"]
        assert {u["flag"] for u in unattached} == {"uncovered"}
        assert {u["property"] for u in unattached} == {"techniques", "components"}


class TestNothingIsLostOnPublish:
    """A finding that cannot attach to a node still has to be recorded.

    `uncovered` is about a property, not a node: there is no node to flag,
    because the point is that one is missing. The builder skips a flag whose node
    id does not exist, so publishing it as a node flag dropped it silently. A run
    that raises five findings and publishes four is a run that lies about itself.
    """

    def test_a_property_level_finding_is_kept_in_the_record(self):
        from fill.models import Draft, Finding, Node, Outcome, Round
        from fill.workflow import payload_of

        outcome = Outcome(
            prop="techniques",
            draft=Draft("techniques", (Node("technique0", "A", "MachineLearning", "AITechnique"),)),
            rounds=[
                Round(
                    number=1,
                    findings=(
                        Finding("technique0", "sentence", "describes, does not name", "critic"),
                        Finding("techniques", "uncovered", "the judge method is missing", "critic"),
                        Finding("uncovered", "uncovered", "a critic that named the flag", "critic"),
                    ),
                )
            ],
        )
        payload = payload_of({"techniques": outcome})
        # the node flag attaches
        assert payload["flags"]["technique0"] == ["sentence"]
        # the other two cannot, so they are in the record rather than dropped
        assert "techniques" not in payload["flags"]
        assert "uncovered" not in payload["flags"]
        unattached = payload["record"]["unattached"]
        assert len(unattached) == 2
        assert {u["flag"] for u in unattached} == {"uncovered"}
        assert all(u["detail"] for u in unattached)

    def test_the_record_says_what_the_run_did(self):
        from fill.models import Draft, Finding, Node, Outcome, Round
        from fill.workflow import payload_of

        outcome = Outcome(
            prop="techniques",
            draft=Draft("techniques", (Node("technique0", "A", None, "AITechnique"),)),
            rounds=[Round(number=1, findings=(), calls=2)],
            stop="clean",
        )
        record = payload_of({"techniques": outcome})["record"]
        assert record["techniques"]["stop"] == "clean"
        assert record["techniques"]["rounds"] == 1
        assert record["calls"] == 2


class TestTheStatesDoTheWork:
    """Each state body performs its step, rather than describing one.

    The machine was drawn before it was wired: draft, review and revise had
    docstrings and empty bodies while run_fill did the work beside them. A state
    that names a step it does not take is worse than no state at all, because
    the diagram, the documentation and the monitoring all report it as real.
    """

    def session(self, qualification=QUALIFICATION):
        from fill.workflow import FillRun

        return FillRun(
            qualification=qualification,
            terms=TERMS,
            complete=FakeCompleter(),
            publish=lambda qid, payload: None,
        )

    def test_loading_plans_the_properties_to_fill(self):
        run = self.session()
        run.load()
        assert run.queue == ["techniques", "components"]
        assert run.current is None

    def test_drafting_produces_nodes_for_the_property_in_hand(self):
        run = self.session()
        run.load()
        run.draft()
        assert run.current == "techniques"
        assert run.draft_in_hand.nodes, "the draft state must actually draft"

    def test_reviewing_runs_the_controls_and_the_critic(self):
        run = self.session()
        run.load()
        run.draft()
        run.review()
        # a clean draft from the fake completer: reviewed, and nothing raised
        assert run.rounds_done == 1
        assert run.findings == []

    def test_reviewing_raises_what_is_wrong(self):
        def ungrounded(system: str, user: str, temperature: float = 0.0) -> str:
            if "The draft:" in user:
                return '{"findings": []}'
            return '{"nodes": [{"label": "Quantum annealing", "vair": "MachineLearning"}]}'

        run = self.session()
        run.complete = ungrounded
        run.load()
        run.draft()
        run.review()
        assert [f.flag for f in run.findings] == ["ungrounded"]

    def test_revising_asks_again_only_about_what_was_named(self):
        from fill.models import Finding

        run = self.session()
        run.load()
        run.draft()
        run.review()  # a revision always follows a review
        before = run.draft_in_hand.nodes
        run.findings = [Finding("technique0", "sentence", "describes", "critic")]
        run.revise()
        assert run.rounds_done == 2
        assert len(run.draft_in_hand.nodes) == len(before)

    def test_a_property_is_finished_and_the_next_one_begins(self):
        run = self.session()
        run.load()
        run.draft()
        run.review()
        run.finish_property()
        assert "techniques" in run.outcomes
        assert run.queue == ["components"]
        assert run.current is None

    def test_publishing_writes_once_when_everything_is_done(self):
        published = {}
        run = self.session()
        run.publish = lambda qid, payload: published.setdefault(qid, payload)
        run.load()
        while run.queue or run.current:
            if run.current is None:
                run.draft()
            run.review()
            run.finish_property()
        run.publish_all()
        assert set(published) == {"q1"}
        assert published["q1"]["techniques"]

    def test_the_same_object_is_what_run_fill_drives(self):
        # One implementation: the function and the state machine must not be two
        # descriptions of the same steps that can drift apart.
        import inspect

        from fill.workflow import FillRun, run_fill

        assert "FillRun" in inspect.getsource(run_fill)


class TestTheMachineAndTheFunctionAreOneImplementation:
    """The bodies call the run's methods, so a change to a step changes both."""

    def test_every_body_calls_the_run(self):
        import inspect

        from fill import workflow

        source = inspect.getsource(workflow.build_agent)
        for step in ("load()", "draft()", "review()", "revise()", "finish_property()", "publish_all()"):
            assert step in source, f"no state performs {step}"

    def test_the_conditions_are_the_runs_own(self):
        import inspect

        from fill import workflow

        source = inspect.getsource(workflow.build_agent)
        assert "needs_revision()" in source
        assert "more_to_draft()" in source

    def test_a_session_without_a_run_says_so(self):
        # A caller that starts the machine with nothing to fill gets told, not a
        # silent pass through six states.
        from unittest.mock import Mock

        from fill.workflow import build_agent

        agent = build_agent()
        load = next(s for s in agent.states if s.name == "load")
        session = Mock()
        session.get.return_value = None

        with pytest.raises(ValueError, match="no run in the session"):
            load._body(session)
