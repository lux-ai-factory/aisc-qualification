"""The model, configured BAF's way, from this service's environment.

One mechanism for the whole app. BAF ships a wrapper per provider and a property
store for their credentials, so that is what this uses: no HTTP client of our
own, no second place a model is named. The provider table and the building
itself live in `fill/baf_llm.py`, which the risk mapper shares; this module is
the environment-only entry point the rest of this service uses.

Switching model is two environment variables:

    BAF_LLM_PROVIDER=mistral|ollama|openai|anthropic|compatible
    BAF_LLM_MODEL=mistral-large-latest

`ollama` and `compatible` are the escape hatches: a model on this machine, or any
endpoint speaking OpenAI chat-completions (vLLM, LM Studio, a gateway), through
BAF_LLM_BASE_URL.

A project can instead have its own model and key, chosen on the platform's
"Models and API keys" page: see `baf_llm.config_for`, which `agent.fill_one` uses.
"""
from __future__ import annotations

import os

from fill import baf_llm
from fill.baf_llm import (  # noqa: F401  re-exported for callers of fill.llm
    DEFAULT_MODEL,
    DEFAULT_PROVIDER,
    OPTIONAL_KEY,
    PROVIDERS,
    Completer,
    LlmConfig,
    completer,
    config_from_env,
)


def build_llm(provider: str | None = None, model: str | None = None, agent=None):
    """A BAF LLM, configured from the environment only (no per-project choice)."""
    config = config_from_env(os.environ, provider, model)
    return baf_llm.build_llm(config, agent=agent, agent_name="ontology_filler_llm")
