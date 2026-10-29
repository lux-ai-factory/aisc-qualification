# Ontology filler (the card agent)

The card agent is the AI assistant of step 1 (Qualify the AI system). It reads
the prose answers of an AI card, drafts the graph nodes they support, reviews
its own draft, and publishes it to the card, flagged for a person to check. In
the AISC stack it is the `qualification-agents` service.

It runs only when a person presses **Let AI suggest additions** on the card
page, never on save. qualification-web then starts a run with
`POST /fill/{pid}/{id}` and the card page polls its state through the app's
`GET /p/{pid}/api/qualifications/{id}/fill`, which asks this service's
`GET /fill/{pid}/{id}`. Pressing the button again while a run is in flight
starts nothing. What the step is for is in `docs/appendices/1-qualify.md` of the
aisc repo; how AISC fits together is in `docs/architecture.md`.

One of the graph's properties cannot be filled from form fields, because the
Annex IV answer it comes from is a paragraph (`DRAFTED` in `fill/workflow.py`):

| Property | From | AIRO class |
|---|---|---|
| `techniques` | Annex IV 2(a), how the system was built | `AITechnique` |

Everything else in the graph comes from a picker, the Components block or a risk
row, which the author types, and needs no model. The loop also accepts
`components` and `risk_types`, but the run drafts neither.

Two further passes run on the same card: one drafts short names for long
answers (`fill/names.py`), and one points out card choices that the author's
own answers contradict, quoting the answer (`fill/consistency.py`). Neither
changes the author's text. A consistency finding is kept only when its quote is
in the answers word for word, starting and ending on a word boundary, and has at
least two content words; a shorter one is dropped as "quote too short".

## The loop

```
load ──► draft ──► controls ──► critic ──► revise
                      ▲  │            │            │
                      │  └── clean ───┴──► publish │ (bounded: 3 rounds)
                      └────────────────────────────┘
```

1. **draft** the model proposes `{label, vair}` for one property, given that
   answer and the terms valid for that class. It proposes; it never writes.
2. **controls** deterministic checks, no model: term defined for the class,
   label is a name, label's words are in the answer, no two nodes carrying one
   term, no answer with content left empty. Cheapest first, so the critic is
   never paid to look at a draft that cannot be written.
3. **critic** the same model in a second role: `_writer` and `_critic` in
   `fill/workflow.py` share the one completion function `agent.py` builds per
   run. Given the answer and the draft but not the draft's justification, it
   raises at most one finding per node and says why in its `why` (the prompt
   asks it to quote the span there; nothing checks it).
4. **revise** the writer is shown its draft by node id and the findings, and
   answers with the whole list again: the named nodes fixed or removed, the
   rest kept, what is missing added. That list replaces the draft, and the
   next round reviews it once. A writer that returns only the fixed nodes
   drops the others; the next review can ask for them back.
5. **publish** the draft is written with `provenance: "extracted"`, and
   unsettled findings ride along as `qual:reviewFlag` triples.

### Stopping rules

| Rule | Fires when | Result |
|---|---|---|
| `clean` | nothing objected | published unflagged |
| `fixpoint` | same node and flag twice running | published flagged |
| `cap` | 3 rounds | published flagged |

**Every exit publishes.** A draft that failed review belongs in the graph with
its findings attached, because the graph is the editing surface. Withholding it
would leave the user with nothing to correct.

The app builds a draft before it stores it, and refuses (422) one the builder
rejects, such as a VAIR term the vocabulary does not have: stored, it would
break the card's graph on every read. The run then fails with the app's
message, and the card keeps the draft it had.

`GET /fill/{pid}/{id}` reports `queued`, `running`, `done` or `failed`, and
404 for a card with no run. Runs are kept in the service's memory, so a restart
forgets them; the published draft is in the card and stays. The
final state is written whatever the ledger does, so a ledger error cannot leave
a run `running`. A failed run's `error` is a short text (at most 300 characters)
with anything key-like taken out; qualification-web passes it on to editors and owners only (a viewer
sees that the run failed). The full
exception goes to the service's log only (`fill/errors.py`). While `LEDGER_MODE` is on, a run that arrives without a UUID in
`X-AISC-Request-Id` records no ledger events, and the agent logs one warning for
that run.

## Layout

```
service.py           the HTTP entry point (FastAPI): POST and GET /fill/{pid}/{id}
agent.py             CLI: --qualification <id> --project <pid> [--dry-run]
fill/workflow.py     FillRun (the steps), run_fill() for callers, and the six
                     BAF states whose bodies call the same steps (no entry point
                     starts the machine)
fill/controls.py     the deterministic checks
fill/agents.py       the writer and the critic, and the parsing of their answers
fill/prompts.py      the writer's and reviewer's prompts, built from prompts/
fill/clients.py      HTTP to the ontology service and the app
fill/baf_llm.py      the provider table, and the model a project chose on the platform
fill/names.py        short names for long answers
fill/consistency.py  the pass that compares card choices with the answers
fill/ledger.py       a run's ledger events, sent to the platform when LEDGER_MODE is on
fill/errors.py       a failed run's short, credential-free error text
fill/view_nodes.py   every node of a card view as one list
fill/models.py       Draft, Node, Finding, Round, Outcome
prompts/             the review, naming and consistency prompts
service_token.py     the X-AISC-Service-Token check (the same file in each service)
Dockerfile.stack     the image the AISC stack builds
```

The drafting prompt is **not** here: it is
`services/ontology/prompts/filling-the-airo-ontology.md`, kept beside the
vocabulary it is about, and `fill/prompts.py` reads it from there. One file, so
a change to the rule cannot apply to half the system.

## The model

A BAF LLM wrapper, with the credential held in BAF's property store. One model
serves the whole run: the writer, the critic and both further passes. It is the
one the card's project chose on the platform (under Manage > AI assistants),
read through the platform's internal route with `PLATFORM_URL` and
`PLATFORM_INTERNAL_TOKEN`. A project without a choice uses the model named by
the environment (`config_from_env` in `fill/baf_llm.py`):

| provider | wrapper | key it reads | model examples |
|---|---|---|---|
| `anthropic` | `LLMAnthropic` | `ANTHROPIC_API_KEY` | `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5-20251001` |
| `mistral` | `LLMMistral` | `MISTRAL_API_KEY` | `mistral-large-latest` |
| `openai` | `LLMOpenAI` | `OPENAI_API_KEY` | `gpt-4o-mini` |
| `google` | `LLMGoogle` | `GOOGLE_API_KEY` | `gemini-2.0-flash` |
| `groq` | `LLMGroq` | `GROQ_API_KEY` | `llama-3.3-70b-versatile` |
| `deepseek` | `LLMDeepSeek` | `DEEPSEEK_API_KEY` | `deepseek-chat` |
| `qwen` | `LLMQwen` | `QWEN_API_KEY` | `qwen-max` |
| `xai` | `LLMxAI` | `XAI_API_KEY` | `grok-2` |
| `meta` | `LLMMeta` | `META_API_KEY` | `llama-3.3-70b` |
| `together` | `LLMTogether` | `TOGETHER_API_KEY` | a Together model id |
| `openrouter` | `LLMOpenRouter` | `OPENROUTER_API_KEY` | any OpenRouter id |
| `compatible` | `LLMOpenAICompatible` | `BAF_LLM_API_KEY` (optional) | anything behind `BAF_LLM_BASE_URL` |
| `ollama` | `LLMOllama` | none | a model on your own machine |

No two providers read the same variable, and a test enforces that. `compatible`
has its own neutral `BAF_LLM_API_KEY` rather than borrowing OpenAI's, because
the endpoint behind it is yours: a vLLM, an LM Studio, a gateway. It needs
`BAF_LLM_BASE_URL`, and no key at all if your server wants none.

Not offered: `LLMReplicate` and `LLMHuggingFace` (local transformers). Their SDKs
are not dependencies here, and BAF imports them lazily, so offering them would
mean a `None` client at the first prediction rather than an error at startup.

```bash
BAF_LLM_PROVIDER=anthropic
BAF_LLM_MODEL=claude-sonnet-5
ANTHROPIC_API_KEY=...
```

In the AISC stack, compose sets `BAF_LLM_PROVIDER`, `BAF_LLM_MODEL` and `BAF_LLM_BASE_URL` from
`QUALIFICATION_AGENTS_LLM_PROVIDER`, `QUALIFICATION_AGENTS_LLM_MODEL` and
`QUALIFICATION_AGENTS_LLM_BASE_URL` (defaults `ollama`, `mistral:latest` and
`http://host.docker.internal:11434`: a model on the host, which needs no key, as for control
objectives) and passes `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` and `MISTRAL_API_KEY` through. The
project's own choice under Manage > AI assistants wins over all of these. The platform's answer is
awaited for `LLM_RESOLVE_TIMEOUT` seconds (default 5). The Next.js app makes no model calls at all.

BAF imports each provider SDK lazily and only logs a warning when one is
missing, so a missing package appears as a `None` client at the first
prediction rather than at startup. `requirements.txt` pins `openai`,
`anthropic` and `ollama` for that reason, each to an exact version.

## Running it

In the AISC stack, from the aisc folder:

```bash
uv run scripts/aisc.py start
```

compose builds this service from `Dockerfile.stack` and gives it its URLs, tokens and model
settings. Then open step 1 of a project, save the form, and press Let AI suggest additions on the
card page.

On its own:

```bash
python3.12 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt

export APP_URL=http://localhost:3000/qualification   # the app, with its base path
export ONTOLOGY_SERVICE_URL=http://localhost:8011
export QUALIFICATION_AGENTS_TO_WEB_TOKEN=...        # its tokens for the app and the ontology
export QUALIFICATION_AGENTS_TO_ONTOLOGY_TOKEN=...
export BAF_LLM_PROVIDER=mistral BAF_LLM_MODEL=mistral-large-latest MISTRAL_API_KEY=...

python agent.py --qualification <id> --project <pid> --dry-run   # draft, review, print, write nothing
python agent.py --qualification <id> --project <pid>             # and publish
QUALIFICATION_WEB_TO_AGENTS_TOKEN=... uvicorn service:app --port 8012   # the HTTP entry point
```

The image is built from `Dockerfile.stack` (this directory as the context, the
ontology prompts as the named context `ontology-prompts`).

Its other settings: `APP_URL` (default `http://localhost:3399`; stack
`http://qualification-web:3000/qualification`), `ONTOLOGY_SERVICE_URL` (default
`http://localhost:8011`), `HTTP_TIMEOUT` (seconds per HTTP call, default 120),
`PLATFORM_URL` and `PLATFORM_INTERNAL_TOKEN` (to read the project's model; stack
token `PLATFORM_CARD_AGENT_TOKEN`), `LEDGER_MODE` and `PLATFORM_LEDGER_AGENTS_TOKEN`
(default `off`; stack `record`), and `FILL_PROMPTS_PATH` (a directory searched
first for the prompt files).

No call sets a temperature, so the provider's default applies: two runs on the
same card can draft differently.

## Tests

```bash
pip install pytest          # not in requirements.txt
python -m pytest            # no network, no model
```

The controls and the stopping rules are tested against a fake writer and critic,
because they are the parts that have to hold when the model misbehaves. The
model-facing code is tested against the answers models actually give: fenced
JSON, prose around the JSON, a refusal, and nonsense. None of them may raise:
a crashed run publishes nothing, and always publishing something is the design.

`tests/test_workflow.py` builds the real BAF machine and asserts its states,
initial state, bodies and transitions, then runs the whole flow with a scripted
model and a fake publisher.

## What it cannot do

- It cannot invent a term. `airo_min/build.py` refuses any VAIR term not defined
  for that node's own class, and the writer is only ever shown the valid list.
- It cannot overwrite your edits. Reviewer corrections live in `ontologyPatch`
  and are applied after `ontologyExtracted` when the graph is built, so a re-run
  cannot clobber a reviewed node.
- It cannot decide anything. It proposes names and types for nodes; the Annex III
  judgement is not its business and not the app's.

## Notes on BAF

`fill/workflow.py` holds the state machine, and `run_fill()` runs the same steps
as a plain function. That duplication is deliberate: the machine is the readable
description of the flow, tested against the same steps, and a function is what
an HTTP request should call. Nothing starts the machine.

BAF checks state-body signatures by inspecting annotations, so a body must be
written `def body(session: Session) -> None:` with no `from __future__ import
annotations` in the module. PEP 563 string annotations fail that check with
`BodySignatureError`.
