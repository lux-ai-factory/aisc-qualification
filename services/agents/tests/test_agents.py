"""The writer and the critic: how a model's answer becomes a draft or findings.

The parsing is what can go wrong here, so it is tested against the answers a
model actually gives: fenced JSON, prose around the JSON, a refusal, and
nonsense. None of these may crash the loop, because a crashed loop publishes
nothing and the whole design rests on always publishing something.
"""
import pytest

from fill.agents import LlmCritic, LlmWriter, parse_findings, parse_nodes
from fill.models import Draft, Node


class TestParsingADraft:
    def test_plain_json(self):
        nodes = parse_nodes(
            '{"nodes": [{"label": "Decision tree", "vair": "MachineLearning"}]}',
            prop="techniques",
        )
        assert nodes == [Node("technique0", "Decision tree", "MachineLearning", "AITechnique")]

    def test_json_in_a_fenced_block(self):
        nodes = parse_nodes(
            'Here is the draft:\n```json\n{"nodes": [{"label": "Policy rules", "vair": null}]}\n```\nDone.',
            prop="techniques",
        )
        assert [n.label for n in nodes] == ["Policy rules"]
        assert nodes[0].vair is None

    def test_ids_are_positional_so_findings_can_name_them(self):
        nodes = parse_nodes(
            '{"nodes": [{"label": "A", "vair": null}, {"label": "B", "vair": null}]}',
            prop="components",
        )
        assert [n.id for n in nodes] == ["component0", "component1"]

    def test_an_empty_list_is_a_legitimate_answer(self):
        assert parse_nodes('{"nodes": []}', prop="techniques") == []

    def test_a_refusal_or_prose_yields_no_nodes_rather_than_an_error(self):
        # An empty draft is caught by the coverage control, which is a finding
        # the writer can act on. An exception would end the workflow instead.
        assert parse_nodes("I cannot help with that.", prop="techniques") == []

    def test_a_node_without_a_label_is_dropped(self):
        nodes = parse_nodes(
            '{"nodes": [{"vair": "MachineLearning"}, {"label": "Real", "vair": null}]}',
            prop="techniques",
        )
        assert [n.label for n in nodes] == ["Real"]

    def test_whitespace_in_a_label_is_tidied_but_the_text_is_kept(self):
        nodes = parse_nodes(
            '{"nodes": [{"label": "  Decision   tree \\n", "vair": null}]}',
            prop="techniques",
        )
        assert nodes[0].label == "Decision tree"


class TestParsingFindings:
    def test_findings_with_node_flag_and_reason(self):
        found = parse_findings(
            '{"findings": [{"node": "technique0", "flag": "ungrounded", "why": "not in the answer"}]}'
        )
        assert len(found) == 1
        assert found[0].node_id == "technique0"
        assert found[0].flag == "ungrounded"
        assert found[0].source == "critic"

    def test_no_findings_is_distinguishable_from_a_silent_critic(self):
        assert parse_findings('{"findings": []}') == []

    def test_a_flag_the_builder_would_refuse_is_dropped(self):
        # The critic inventing a flag would make the draft unpublishable.
        found = parse_findings(
            '{"findings": [{"node": "technique0", "flag": "smells-wrong", "why": "x"},'
            ' {"node": "technique1", "flag": "sentence", "why": "y"}]}'
        )
        assert [f.flag for f in found] == ["sentence"]

    def test_unparseable_output_raises_no_findings(self):
        assert parse_findings("Looks good to me!") == []


class TestThePromptsAreFound:
    def test_the_writer_uses_the_prompt_kept_with_the_vocabulary(self):
        from fill.prompts import prompt_text

        body = prompt_text("filling-the-airo-ontology")
        # Read from services/ontology/prompts, not copied here: one file, so a
        # change to the rule cannot apply to only half the system.
        assert "The vocabulary sets the granularity" in body
        assert not body.startswith("---")

    def test_the_critic_has_its_own_prompt(self):
        from fill.prompts import prompt_text

        body = prompt_text("reviewing-an-ontology-draft")
        assert "The answer is the only evidence" in body

    def test_a_missing_prompt_says_where_it_looked(self):
        from fill.prompts import prompt_text

        with pytest.raises(FileNotFoundError, match="looked in"):
            prompt_text("no-such-prompt")


class FakeCompleter:
    def __init__(self, *replies: str):
        self.replies = list(replies)
        self.seen: list[tuple[str, str]] = []

    def __call__(self, system: str, user: str, temperature: float = 0.0) -> str:
        self.seen.append((system, user))
        return self.replies[min(len(self.seen) - 1, len(self.replies) - 1)]


class TestTheWriterAndCriticAsLoopParticipants:
    def test_the_writer_returns_a_draft_the_loop_can_use(self):
        completer = FakeCompleter('{"nodes": [{"label": "Decision tree", "vair": "MachineLearning"}]}')
        writer = LlmWriter(complete=completer)
        draft = writer.draft("techniques", "a gradient-boosted decision tree", ["MachineLearning"])
        assert isinstance(draft, Draft)
        assert draft.nodes[0].vair == "MachineLearning"

    def test_the_writer_is_given_the_term_list_and_the_source(self):
        completer = FakeCompleter('{"nodes": []}')
        LlmWriter(complete=completer).draft(
            "techniques", "the source answer", ["MachineLearning", "DeepLearning"]
        )
        _, user = completer.seen[0]
        assert "the source answer" in user
        assert "MachineLearning, DeepLearning" in user

    def test_the_critic_returns_findings_the_loop_can_use(self):
        completer = FakeCompleter(
            '{"findings": [{"node": "technique0", "flag": "ungrounded", "why": "invented"}]}'
        )
        critic = LlmCritic(complete=completer)
        found = critic.review(
            Draft("techniques", (Node("technique0", "Quantum annealing", None, "AITechnique"),)),
            "a gradient-boosted decision tree",
        )
        assert found[0].flag == "ungrounded"

    def test_the_critic_sees_the_draft_and_the_source_but_not_the_writer(self):
        completer = FakeCompleter('{"findings": []}')
        LlmCritic(complete=completer).review(
            Draft("techniques", (Node("technique0", "Decision tree", None, "AITechnique"),)),
            "the source answer",
        )
        _, user = completer.seen[0]
        assert "Decision tree" in user
        assert "the source answer" in user
        # independence: no trace of how the draft was justified
        assert "reason" not in user.lower()
