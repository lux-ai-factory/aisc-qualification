"""Refine with AI works on top of the card (2026-09-30).

The card is built from the form alone; the filler only runs when a person asks
it to, and it starts from what the card already holds. The card's own
Components rows are already on the card: the writer is told not to propose
them again, the critic not to report them as missing, and a node that repeats
one anyway is dropped before the draft is published.
"""
from fill.agents import LlmCritic
from fill.models import Draft, Node
from fill.prompts import critic_prompt, writer_prompt
from fill.workflow import known_parts, payload_of, run_fill

QUALIFICATION = {
    "id": "q1",
    "answers": [
        {"toolId": "annex-2", "questionId": "2a", "answer": "A gradient-boosted decision tree."},
        {"toolId": "annex-2", "questionId": "2c", "answer": "A scoring model and a hosted explanation LLM."},
    ],
    "risks": [],
    "systemComponents": [
        {"key": "k1", "name": "Scoring model", "role": "", "kind": "model", "provider": "in_house", "providerName": ""},
    ],
}
TERMS = {"AITechnique": ["MachineLearning"], "AIComponent": ["Model", "Tool"]}


class Fake:
    def __init__(self):
        self.users: list[str] = []

    def __call__(self, system: str, user: str, temperature=None) -> str:
        self.users.append(user)
        if "review" in system[:200].lower():
            return '{"findings": []}'
        if "Property: techniques" in user:
            return '{"nodes": [{"label": "Gradient-boosted decision tree", "vair": "MachineLearning"}]}'
        return (
            '{"nodes": [{"label": "scoring  Model", "vair": "Model"},'
            ' {"label": "Hosted explanation LLM", "vair": "Tool"}]}'
        )


def test_the_card_s_parts_are_read_from_its_components_rows():
    assert known_parts(QUALIFICATION) == {"components": ["Scoring model"]}
    assert known_parts({"id": "q"}) == {}


def test_the_writer_is_told_what_is_already_on_the_card():
    _, user = writer_prompt("components", "src", ["Model"], (), known=["Scoring model"])
    assert "already on the card" in user
    assert "- Scoring model" in user


def test_without_parts_the_writer_is_asked_what_it_was_asked_before():
    assert writer_prompt("components", "src", ["Model"]) == writer_prompt("components", "src", ["Model"], (), known=[])


def test_the_critic_does_not_count_them_as_missing():
    draft = Draft(prop="components", nodes=())
    _, user = critic_prompt(draft, "src", known=["Scoring model"])
    assert "already on the card" in user and "Scoring model" in user
    assert critic_prompt(draft, "src") == critic_prompt(draft, "src", known=[])


# Since 2026-09-30 the filler drafts techniques only (tests/test_questions_only.py): the Components
# block states the parts. The mechanism below stays for any property drafted on top of the card's
# own rows, so these two tests switch components back on to exercise it.
import pytest


@pytest.fixture
def drafting_components(monkeypatch):
    monkeypatch.setattr("fill.workflow.DRAFTED", ("techniques", "components"))


@pytest.mark.usefixtures("drafting_components")
def test_a_node_that_repeats_a_part_is_dropped_and_the_rest_renumbered():
    fake = Fake()
    published = {}
    run_fill(QUALIFICATION, TERMS, fake, lambda qid, p: published.update(p))
    assert published["components"] == [{"label": "Hosted explanation LLM", "vair": "Tool"}]
    assert published["techniques"] == [{"label": "Gradient-boosted decision tree", "vair": "MachineLearning"}]
    component_prompts = [u for u in fake.users if "Property: components" in u]
    assert component_prompts and all("Scoring model" in u for u in component_prompts)


@pytest.mark.usefixtures("drafting_components")
def test_a_flag_follows_its_node_when_the_ids_move():
    from fill.models import Finding, Outcome, Round

    nodes = (Node(id="component0", label="Scoring model", vair="Model", cls="AIComponent"),
             Node(id="component1", label="Hosted LLM", vair="Tool", cls="AIComponent"))
    outcome = Outcome(
        prop="components",
        draft=Draft(prop="components", nodes=nodes),
        rounds=[Round(number=1, findings=(Finding(node_id="component1", flag="inflated", detail="d"),
                                          Finding(node_id="component0", flag="ungrounded", detail="d")))],
        stop="cap",
    )
    payload = payload_of({"components": outcome}, known={"components": ["Scoring model"]})
    assert payload["components"] == [{"label": "Hosted LLM", "vair": "Tool"}]
    assert payload["flags"] == {"component0": ["inflated"]}
