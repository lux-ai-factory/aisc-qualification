"""The model, configured BAF's way.

One mechanism: a BAF LLM wrapper, chosen and configured through BAF properties,
holding the credential itself. The service no longer has an LLM client of its
own, and there is no second place to name a model.
"""
import pytest

pytest.importorskip("baf")

from fill.llm import PROVIDERS, build_llm, completer


class FakeLlm:
    """Stands in for a BAF LLM: same predict() signature."""

    def __init__(self):
        self.calls = []

    def predict(self, message, parameters=None, session=None, system_message=None):
        self.calls.append(
            {"message": message, "system": system_message, "parameters": parameters}
        )
        return '{"nodes": []}'


class TestTheCompleter:
    def test_it_passes_the_system_prompt_as_a_system_message(self):
        llm = FakeLlm()
        text = completer(llm)("the system prompt", "the draft request")
        assert text == '{"nodes": []}'
        assert llm.calls[0]["system"] == "the system prompt"
        assert llm.calls[0]["message"] == "the draft request"

    def test_temperature_reaches_the_model(self):
        llm = FakeLlm()
        completer(llm)("sys", "usr", temperature=0.0)
        assert llm.calls[0]["parameters"]["temperature"] == 0.0

    def test_it_is_the_shape_the_loop_expects(self):
        # fill/loop.py takes any (system, user, temperature=...) -> str
        from fill.agents import LlmWriter

        draft = LlmWriter(complete=completer(FakeLlm())).draft(
            "techniques", "source", ["MachineLearning"]
        )
        assert draft.nodes == ()


class TestProviders:
    def test_every_provider_baf_ships_that_works_here_is_offered(self):
        # Ten of BAF's fifteen wrappers subclass LLMOpenAICompatible and need
        # only the openai SDK, which is already a dependency: offering them by
        # name costs nothing. The ones left out need an SDK we do not ship
        # (replicate, transformers) and would be a silent None client.
        assert set(PROVIDERS) == {
            "anthropic",
            "compatible",
            "deepseek",
            "google",
            "groq",
            "meta",
            "mistral",
            "ollama",
            "openai",
            "openrouter",
            "qwen",
            "together",
            "xai",
        }

    def test_a_local_model_is_among_them(self):
        # The data-sovereignty path: no key, no network beyond this machine.
        assert PROVIDERS["ollama"][1] is None

    def test_no_two_providers_share_a_key_variable(self):
        # `compatible` used to read OPENAI_API_KEY, which meant pointing at your
        # own vLLM required a variable named for OpenAI, and using both
        # providers collided on one value.
        seen: dict[str, str] = {}
        for name, (_, _, env_var) in PROVIDERS.items():
            if env_var is None:
                continue
            assert env_var not in seen, f"{name} and {seen[env_var]} both read {env_var}"
            seen[env_var] = name

    def test_a_generic_endpoint_has_its_own_neutral_variable(self):
        assert PROVIDERS["compatible"][2] == "BAF_LLM_API_KEY"

    def test_a_generic_endpoint_needs_no_key_at_all(self, monkeypatch):
        # A local vLLM or LM Studio usually has no credential, which is the
        # common case for this provider. The OpenAI SDK still insists on one, so
        # a placeholder goes in that such a server ignores.
        monkeypatch.delenv("BAF_LLM_API_KEY", raising=False)
        monkeypatch.setenv("BAF_LLM_BASE_URL", "http://localhost:8000/v1")
        llm = build_llm(provider="compatible", model="my-local-model")
        assert llm.name == "my-local-model"

    def test_a_generic_endpoint_uses_its_key_when_there_is_one(self, monkeypatch):
        from baf import nlp
        from baf.core.agent import Agent

        monkeypatch.setenv("BAF_LLM_API_KEY", "gateway-token")
        monkeypatch.setenv("BAF_LLM_BASE_URL", "http://gateway/v1")
        agent = Agent("gateway_agent")
        build_llm(provider="compatible", model="whatever", agent=agent)
        assert agent.get_property(nlp.OPENAI_API_KEY) == "gateway-token"

    def test_a_local_model_takes_its_base_url_from_bafs_property(self, monkeypatch):
        from baf import nlp
        from baf.core.agent import Agent

        monkeypatch.setenv("BAF_LLM_BASE_URL", "http://localhost:11434")
        agent = Agent("ollama_agent")
        build_llm(provider="ollama", model="llama3.2:1b", agent=agent)
        assert agent.get_property(nlp.OLLAMA_BASE_URL) == "http://localhost:11434"

    def test_a_provider_nobody_supports_says_which_are(self):
        with pytest.raises(ValueError, match="mistral"):
            build_llm(provider="telepathy")

    def test_a_local_model_needs_no_key(self, monkeypatch):
        # Ollama runs on the machine, so there is no credential to hold.
        monkeypatch.delenv("MISTRAL_API_KEY", raising=False)
        llm = build_llm(provider="ollama", model="gemma3")
        assert llm.name == "gemma3"

    def test_a_hosted_model_without_its_key_fails_clearly(self, monkeypatch):
        monkeypatch.delenv("MISTRAL_API_KEY", raising=False)
        with pytest.raises(ValueError, match="MISTRAL_API_KEY"):
            build_llm(provider="mistral", model="mistral-large-latest")

    def test_the_key_is_read_from_the_environment_into_a_baf_property(self, monkeypatch):
        from baf import nlp
        from baf.core.agent import Agent

        monkeypatch.setenv("MISTRAL_API_KEY", "not-a-real-key")
        agent = Agent("test_agent")
        build_llm(provider="mistral", model="mistral-large-latest", agent=agent)
        # BAF's own property store holds the credential, not a global of ours.
        # The LLM reads it from there through the agent's nlp engine.
        assert agent.get_property(nlp.MISTRAL_API_KEY) == "not-a-real-key"

    def test_the_llm_comes_back_ready_to_use(self, monkeypatch):
        # BAF initialises its LLMs when the agent runs. This workflow drives the
        # flow itself, so nothing else will: an uninitialised wrapper fails at
        # the first predict with `'NoneType' object has no attribute 'chat'`.
        monkeypatch.setenv("MISTRAL_API_KEY", "not-a-real-key")
        llm = build_llm(provider="mistral", model="mistral-large-latest")
        assert llm.client is not None

    def test_the_sdk_each_one_needs_is_installed(self):
        # BAF imports provider SDKs lazily and only warns, so an offered
        # provider whose SDK is missing fails at the first prediction.
        import importlib

        for sdk in ("openai", "anthropic", "ollama"):
            importlib.import_module(sdk)

    def test_claude_works_the_same_way(self, monkeypatch):
        # LLMAnthropic is not an OpenAI-compatible subclass: it uses the native
        # SDK, imported lazily with only a warning, so a missing `anthropic`
        # package would surface as a failure at the first prediction.
        from baf import nlp
        from baf.core.agent import Agent

        monkeypatch.setenv("ANTHROPIC_API_KEY", "not-a-real-key")
        agent = Agent("claude_agent")
        llm = build_llm(provider="anthropic", model="claude-sonnet-5", agent=agent)
        assert llm.name == "claude-sonnet-5"
        assert llm.client is not None
        assert agent.get_property(nlp.ANTHROPIC_API_KEY) == "not-a-real-key"

    def test_claude_without_its_key_says_which_variable(self, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        with pytest.raises(ValueError, match="ANTHROPIC_API_KEY"):
            build_llm(provider="anthropic", model="claude-sonnet-5")

    def test_the_default_is_one_place(self, monkeypatch):
        monkeypatch.setenv("MISTRAL_API_KEY", "not-a-real-key")
        monkeypatch.delenv("BAF_LLM_PROVIDER", raising=False)
        monkeypatch.delenv("BAF_LLM_MODEL", raising=False)
        llm = build_llm()
        assert llm.name == "mistral-large-latest"


class TestNothingElseTalksToAModel:
    def test_the_service_has_no_llm_client_of_its_own(self):
        from fill import clients

        assert not hasattr(clients, "complete")
        assert not hasattr(clients, "LLM_URL")
        assert not hasattr(clients, "MODEL")
