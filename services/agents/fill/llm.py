"""The model, configured BAF's way.

One mechanism for the whole app. BAF ships a wrapper per provider and a property
store for their credentials, so that is what this uses: no HTTP client of our
own, no second place a model is named, and the key stays in BAF's properties read
from the environment.

Switching model is two environment variables:

    BAF_LLM_PROVIDER=mistral|ollama|openai|anthropic|compatible
    BAF_LLM_MODEL=mistral-large-latest

`ollama` and `compatible` are the escape hatches: a model on this machine, or any
endpoint speaking OpenAI chat-completions (vLLM, LM Studio, a gateway), through
BAF_LLM_BASE_URL.
"""
from __future__ import annotations

import os
from typing import Callable

from baf import nlp
from baf.core.agent import Agent
from baf.nlp.llm.llm_anthropic import LLMAnthropic
from baf.nlp.llm.llm_deepseek import LLMDeepSeek
from baf.nlp.llm.llm_google import LLMGoogle
from baf.nlp.llm.llm_groq import LLMGroq
from baf.nlp.llm.llm_meta import LLMMeta
from baf.nlp.llm.llm_mistral import LLMMistral
from baf.nlp.llm.llm_ollama import LLMOllama
from baf.nlp.llm.llm_openai_api import LLMOpenAI
from baf.nlp.llm.llm_openai_compatible import LLMOpenAICompatible
from baf.nlp.llm.llm_openrouter import LLMOpenRouter
from baf.nlp.llm.llm_qwen import LLMQwen
from baf.nlp.llm.llm_together import LLMTogether
from baf.nlp.llm.llm_xai import LLMxAI

#: provider name -> (BAF wrapper, the property holding its key, the env var it
#: comes from). No two providers read the same variable, and a provider that
#: needs no credential says None twice: a local model has nothing to
#: authenticate with, and a generic endpoint usually does not either.
#: Every BAF wrapper whose SDK this service ships: the ten OpenAI-compatible
#: ones (openai), Claude (anthropic) and a local model (ollama). Replicate and
#: the local-transformers wrapper are left out: their SDKs are not dependencies
#: here, and BAF fails at the first prediction rather than at startup.
PROVIDERS: dict[str, tuple[type, object | None, str | None]] = {
    "anthropic": (LLMAnthropic, nlp.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY"),
    # Its own neutral variable, not OpenAI's: this provider is for a vLLM, an
    # LM Studio or a gateway, whose token is not an OpenAI key. Optional,
    # because a local endpoint usually has none.
    "compatible": (LLMOpenAICompatible, nlp.OPENAI_API_KEY, "BAF_LLM_API_KEY"),
    "deepseek": (LLMDeepSeek, nlp.DEEPSEEK_API_KEY, "DEEPSEEK_API_KEY"),
    "google": (LLMGoogle, nlp.GOOGLE_API_KEY, "GOOGLE_API_KEY"),
    "groq": (LLMGroq, nlp.GROQ_API_KEY, "GROQ_API_KEY"),
    "meta": (LLMMeta, nlp.META_API_KEY, "META_API_KEY"),
    "mistral": (LLMMistral, nlp.MISTRAL_API_KEY, "MISTRAL_API_KEY"),
    "ollama": (LLMOllama, None, None),
    "openai": (LLMOpenAI, nlp.OPENAI_API_KEY, "OPENAI_API_KEY"),
    "openrouter": (LLMOpenRouter, nlp.OPENROUTER_API_KEY, "OPENROUTER_API_KEY"),
    "qwen": (LLMQwen, nlp.QWEN_API_KEY, "QWEN_API_KEY"),
    "together": (LLMTogether, nlp.TOGETHER_API_KEY, "TOGETHER_API_KEY"),
    "xai": (LLMxAI, nlp.XAI_API_KEY, "XAI_API_KEY"),
}

#: Providers that work without a credential: a model on this machine, and an
#: endpoint you host, which may or may not ask for a token.
OPTIONAL_KEY = frozenset({"ollama", "compatible"})

DEFAULT_PROVIDER = "mistral"
DEFAULT_MODEL = "mistral-large-latest"


def build_llm(
    provider: str | None = None,
    model: str | None = None,
    agent: Agent | None = None,
):
    """A BAF LLM, configured from the environment through BAF's property store."""
    provider = (provider or os.environ.get("BAF_LLM_PROVIDER") or DEFAULT_PROVIDER).lower()
    model = model or os.environ.get("BAF_LLM_MODEL") or DEFAULT_MODEL

    if provider not in PROVIDERS:
        raise ValueError(
            f"{provider!r} is not a provider this service configures; "
            f"expected one of {', '.join(sorted(PROVIDERS))}"
        )
    wrapper, key_property, env_var = PROVIDERS[provider]

    # The agent is BAF's configuration scope: properties live on it, and the LLM
    # reads its credential from there rather than from us.
    agent = agent or Agent("ontology_filler_llm")
    base_url = os.environ.get("BAF_LLM_BASE_URL")
    key = os.environ.get(env_var) if env_var else None

    if key:
        agent.set_property(key_property, key)
    elif provider not in OPTIONAL_KEY:
        raise ValueError(
            f"{provider} needs {env_var} in the environment; "
            "set it, or use BAF_LLM_PROVIDER=ollama for a local model"
        )

    parameters: dict[str, object] = {}
    if provider == "ollama" and base_url:
        # Ollama's endpoint is a BAF property of its own.
        agent.set_property(nlp.OLLAMA_BASE_URL, base_url)
    elif provider == "compatible":
        if not base_url:
            raise ValueError(
                "compatible needs BAF_LLM_BASE_URL: it is the provider for an "
                "endpoint you host, so there is no default to fall back on"
            )
        parameters["base_url"] = base_url
        # The OpenAI SDK refuses to construct without a key even when the
        # endpoint is local and wants none, so an endpoint with no credential
        # gets a placeholder, which such a server ignores.
        parameters["api_key"] = key or "not-needed"

    llm = wrapper(agent=agent, name=model, parameters=parameters)
    # BAF initialises its LLMs when the agent runs, and this workflow drives the
    # flow itself, so without this the first predict fails on a client that was
    # never built.
    llm.initialize()
    return llm


Completer = Callable[..., str]


def completer(llm) -> Completer:
    """Adapt a BAF LLM to the two-prompt call the loop makes.

    The loop asks for (system, user); BAF's predict takes the user message and
    the system message separately, which is the same thing said its way.
    """

    def complete(system: str, user: str, temperature: float = 0.0) -> str:
        return llm.predict(
            user,
            parameters={"temperature": temperature},
            system_message=system,
        )

    return complete
