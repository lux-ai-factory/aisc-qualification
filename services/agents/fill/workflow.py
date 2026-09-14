"""The workflow itself: six BAF states, and the loop they run.

    load ──► draft ──► review ──► revise ──┐
                         │                 │  (a finding, rounds left)
                         │ (settled)       │
                         ▼                 │
                      publish ──► done ◄───┘

`draft`, `review` and `revise` are the review loop from fill/loop.py, one
property at a time; the state machine is what makes the rounds legible from
outside, and BAF's monitoring database is what records them.

`run_fill` runs the same steps without a platform, which is what the tests and
the HTTP entry point use: a state machine is a good way to describe a flow and a
poor way to be called by a web request.
"""
from dataclasses import dataclass, field
from typing import Callable

from .agents import LlmCritic, LlmWriter
from .controls import run_controls
from .models import (
    CITATION_OF,
    CLASS_OF,
    Draft,
    Finding,
    Outcome,
    PROPERTIES,
    Property,
    Round,
)

#: The states, in the order the work happens. Asserted by the tests, so the
#: diagram above and the machine cannot drift apart.
STATE_NAMES = ("load", "draft", "review", "revise", "publish", "done")

MAX_ROUNDS = 3

#: The properties this workflow drafts today. `risk_types` needs the risk rows
#: and a per-node class, which is the next increment.
DRAFTED: tuple[Property, ...] = ("techniques", "components")


@dataclass
class FillResult:
    """What one run did, for the record the card shows."""

    outcomes: dict[str, Outcome] = field(default_factory=dict)
    payload: dict = field(default_factory=dict)

    @property
    def stop_reasons(self) -> dict[str, str]:
        return {prop: o.stop for prop, o in self.outcomes.items()}

    @property
    def rounds(self) -> int:
        return sum(len(o.rounds) for o in self.outcomes.values())

    @property
    def calls(self) -> int:
        return sum(o.calls for o in self.outcomes.values())

    @property
    def open_findings(self) -> int:
        return sum(len(o.open_findings) for o in self.outcomes.values())


def answer_for(qualification: dict, citation: str) -> str:
    """The answer a property is drafted from, found by its Annex IV citation."""
    wanted = citation.replace("Annex IV(", "").replace(")", "").replace("(", "")
    for answer in qualification.get("answers", []):
        key = f"{answer.get('toolId', '')}:{answer.get('questionId', '')}"
        if key.endswith(wanted.lower()) or answer.get("questionId") == wanted.lower():
            return answer.get("answer", "")
    return ""


def payload_of(outcomes: dict[str, Outcome]) -> dict:
    """The `extracted` document the builder reads: the draft, its flags, its record.

    Node ids are positional and assigned by the parser, so they match the ids the
    builder mints for the same list. A finding that names no node in the draft
    cannot be a flag: `uncovered` is about a property, and a critic sometimes
    answers with the flag where the node should be. The builder skips a flag
    whose node does not exist, so publishing those as flags dropped them in
    silence. They go in the record instead, where the card can show them.
    """
    payload: dict = {"flags": {}, "record": {}}
    unattached: list[dict] = []
    calls = 0

    for prop in DRAFTED:
        outcome = outcomes.get(prop)
        nodes = outcome.draft.nodes if outcome else ()
        payload[prop] = [{"label": n.label, "vair": n.vair} for n in nodes]
        if not outcome:
            continue

        ids = {n.id for n in nodes}
        for finding in outcome.open_findings:
            if finding.node_id in ids:
                payload["flags"].setdefault(finding.node_id, []).append(finding.flag)
            else:
                unattached.append(
                    {
                        "property": prop,
                        "flag": finding.flag,
                        "detail": finding.detail,
                        "source": finding.source,
                    }
                )

        calls += outcome.calls
        payload["record"][prop] = {
            "stop": outcome.stop,
            "rounds": len(outcome.rounds),
            "nodes": len(nodes),
            "flagged": sum(
                1 for f in outcome.open_findings if f.node_id in ids
            ),
        }

    payload["record"]["calls"] = calls
    if unattached:
        payload["record"]["unattached"] = unattached
    return payload



@dataclass
class FillRun:
    """One qualification's fill, as an object the steps operate on.

    The steps are methods rather than a loop body so that the plain function and
    the BAF state machine drive the same code. They used to be two descriptions
    of the same work, one of which did nothing.
    """

    qualification: dict
    terms: dict[str, list[str]]
    complete: Callable[..., str]
    publish: Callable[[str, dict], object]
    max_rounds: int = MAX_ROUNDS

    queue: list[Property] = field(default_factory=list)
    current: Property | None = None
    draft_in_hand: Draft | None = None
    findings: list[Finding] = field(default_factory=list)
    rounds: list[Round] = field(default_factory=list)
    outcomes: dict[str, Outcome] = field(default_factory=dict)
    payload: dict = field(default_factory=dict)

    @property
    def rounds_done(self) -> int:
        return len(self.rounds)

    # ── the steps ────────────────────────────────────────────────────────────

    def load(self) -> None:
        """Plan which properties this qualification can fill."""
        self.queue = list(DRAFTED)
        self.current = None

    def draft(self) -> None:
        """Take the next property and propose nodes for it."""
        self.current = self.queue.pop(0)
        self.draft_in_hand = self._writer().draft(
            self.current, self._source(), self._terms()
        )
        self.findings = []
        self.rounds = []

    def review(self) -> None:
        """Run the deterministic controls, then the critic if they pass."""
        draft = self.draft_in_hand
        assert draft is not None, "review before draft"
        self.findings = run_controls(draft, self._source(), self._terms())
        calls = 1
        if not self.findings:
            self.findings = list(self._critic().review(draft, self._source()))
            calls = 2
        self.rounds.append(
            Round(
                number=self.rounds_done + 1,
                findings=tuple(self.findings),
                revised=tuple(f.node_id for f in self.findings),
                calls=calls,
            )
        )

    def revise(self) -> None:
        """Ask again about the nodes a finding named, keeping the rest."""
        assert self.draft_in_hand is not None, "revise before draft"
        fresh = self._writer().draft(
            self.current, self._source(), self._terms(), self.findings
        )
        self.draft_in_hand = self.draft_in_hand.merge(fresh.nodes)
        self.review()

    def finish_property(self) -> None:
        """Record where this property's loop ended, and move on."""
        assert self.current is not None and self.draft_in_hand is not None
        self.outcomes[self.current] = Outcome(
            prop=self.current,
            draft=self.draft_in_hand,
            rounds=list(self.rounds),
            stop=self._stop_reason(),
        )
        self.current = None
        self.draft_in_hand = None

    def publish_all(self) -> None:
        """Write the drafts and their flags where the card reads them."""
        self.payload = payload_of(self.outcomes)
        self.publish(self.qualification["id"], self.payload)

    # ── the conditions the state machine branches on ─────────────────────────

    def needs_revision(self) -> bool:
        """A finding is open, a round remains, and the last two differ."""
        if not self.findings or self.rounds_done >= self.max_rounds:
            return False
        return not self._repeating()

    def more_to_draft(self) -> bool:
        return bool(self.queue)

    # ── internals ────────────────────────────────────────────────────────────

    def _stop_reason(self) -> str:
        if not self.findings:
            return "clean"
        if self._repeating():
            return "fixpoint"
        return "cap"

    def _repeating(self) -> bool:
        """The same node and flag raised two rounds running."""
        if self.rounds_done < 2:
            return False
        signature = lambda r: frozenset((f.node_id, f.flag) for f in r.findings)
        return signature(self.rounds[-1]) == signature(self.rounds[-2])

    def _source(self) -> str:
        return answer_for(self.qualification, CITATION_OF[self.current])

    def _terms(self) -> list[str]:
        return self.terms.get(CLASS_OF[self.current], [])

    def _writer(self) -> LlmWriter:
        return LlmWriter(complete=self.complete)

    def _critic(self) -> LlmCritic:
        return LlmCritic(complete=self.complete)


def run_fill(
    qualification: dict,
    terms: dict[str, list[str]],
    complete: Callable[..., str],
    publish: Callable[[str, dict], object],
    max_rounds: int = MAX_ROUNDS,
) -> FillResult:
    """Draft, review and publish one qualification's extracted document.

    The same steps the state machine runs, driven directly. This is what an HTTP
    request calls: a state machine is a good way to describe a flow and a poor
    thing to invoke from a request handler.
    """
    run = FillRun(
        qualification=qualification,
        terms=terms,
        complete=complete,
        publish=publish,
        max_rounds=max_rounds,
    )
    run.load()
    while run.more_to_draft():
        run.draft()
        run.review()
        while run.needs_revision():
            run.revise()
        run.finish_property()
    run.publish_all()

    result = FillResult()
    result.outcomes = run.outcomes
    result.payload = run.payload
    return result


def build_agent(name: str = "ontology_filler"):
    """The same steps as a BAF agent, for its platforms and its run history.

    Every body calls a method of FillRun, which is what run_fill drives too, so
    there is one implementation of the work and two ways to set it going.

    BAF is imported here rather than at module level: the loop, the controls and
    the parsers are testable without the framework, and only this function needs
    it.
    """
    from baf.core.agent import Agent
    from baf.core.session import Session

    agent = Agent(name)

    load = agent.new_state("load", initial=True)
    draft = agent.new_state("draft")
    review = agent.new_state("review")
    revise = agent.new_state("revise")
    publish = agent.new_state("publish")
    done = agent.new_state("done")

    def current_run(session: Session) -> FillRun:
        """The run this session is working on.

        Put there by whatever started the session (the A2A task, or a test);
        without it there is nothing to fill, which is a caller's mistake rather
        than a state to handle.
        """
        run = session.get("run")
        if run is None:
            raise ValueError("no run in the session: set session['run'] first")
        return run

    def load_body(session: Session) -> None:
        """Read the vocabularies and plan the properties to fill."""
        from . import clients

        run = current_run(session)
        if not run.terms:
            run.terms = clients.vocabularies()
        run.load()

    def draft_body(session: Session) -> None:
        """Propose nodes for the property at the head of the queue."""
        current_run(session).draft()

    def review_body(session: Session) -> None:
        """Run the controls, then the critic on what survives them."""
        current_run(session).review()

    def revise_body(session: Session) -> None:
        """Re-propose the nodes a finding named, then review again."""
        current_run(session).revise()

    def publish_body(session: Session) -> None:
        """Record the finished property, and write once the queue is empty."""
        run = current_run(session)
        if run.current is not None:
            run.finish_property()
        if not run.more_to_draft():
            run.publish_all()

    def done_body(session: Session) -> None:
        """Report what the run cost and what it left open."""
        run = current_run(session)
        open_findings = sum(len(o.open_findings) for o in run.outcomes.values())
        session.reply(
            f"Filled {len(run.outcomes)} properties, "
            f"{open_findings} findings left for review."
        )

    for state, body in (
        (load, load_body),
        (draft, draft_body),
        (review, review_body),
        (revise, revise_body),
        (publish, publish_body),
        (done, done_body),
    ):
        state.set_body(body)

    # The conditions are the run's own, so the machine branches on the same
    # rules the function applies rather than a second copy of them.
    def needs_revision(session: Session) -> bool:
        return current_run(session).needs_revision()

    def settled(session: Session) -> bool:
        return not current_run(session).needs_revision()

    def more_to_draft(session: Session) -> bool:
        return current_run(session).more_to_draft()

    def finished(session: Session) -> bool:
        return not current_run(session).more_to_draft()

    load.go_to(draft)
    draft.go_to(review)
    review.when_condition(needs_revision).go_to(revise)
    review.when_condition(settled).go_to(publish)
    revise.go_to(review)
    publish.when_condition(more_to_draft).go_to(draft)
    publish.when_condition(finished).go_to(done)

    return agent
