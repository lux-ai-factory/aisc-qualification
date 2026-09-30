"""Refine with AI reads only the answers to the questions (2026-09-30).

The form speaks VAIR: every structured field, the Components block included, is typed by the author
from VAIR's own lists, so the card is built from the form alone. What is left for the filler is what
only prose says: the techniques of Annex IV 2(a). It no longer drafts components, which the
Components block states.
"""
from fill.workflow import DRAFTED, run_fill

QUALIFICATION = {
    "id": "q1",
    "answers": [
        {"toolId": "annex-2", "questionId": "2a", "answer": "A gradient-boosted decision tree."},
        {"toolId": "annex-2", "questionId": "2c", "answer": "A scoring model and a hosted explanation LLM."},
    ],
    "risks": [],
    "systemComponents": [],
}


def test_it_drafts_the_techniques_only():
    assert DRAFTED == ("techniques",)


def test_a_run_asks_about_techniques_and_publishes_no_components():
    asked: list[str] = []

    def fake(system: str, user: str, temperature=None) -> str:
        asked.append(user)
        if "review" in system[:200].lower():
            return '{"findings": []}'
        return '{"nodes": [{"label": "Gradient-boosted decision tree", "vair": "MachineLearning"}]}'

    published = {}
    run_fill(QUALIFICATION, {"AITechnique": ["MachineLearning"]}, fake, lambda qid, p: published.update(p))
    assert published["techniques"] == [{"label": "Gradient-boosted decision tree", "vair": "MachineLearning"}]
    assert "components" not in published
    assert not any("Property: components" in u for u in asked)
