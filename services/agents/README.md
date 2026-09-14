# Ontology filler

Reads the prose answers of a qualification, drafts the ontology nodes they
support, reviews its own draft, and publishes it to the graph flagged for a
person to edit.

Two of the graph's properties cannot be filled from form fields, because the
Annex IV answers they come from are paragraphs:

| Property | From | AIRO class |
|---|---|---|
| `techniques` | Annex IV 2(a), how the system was built | `AITechnique` |
| `components` | Annex IV 2(c), what it is made of | `AIComponent` |

Everything else in the graph comes from a picker or a risk row and needs no
model. `risk_types` (naming and typing the risk-chain nodes) is the next
increment; the loop already takes it, the prompt does not yet.

## The loop

```
load ──► draft ──► controls ──► critic ──► revise ──┐
                      │            │                │
                      └── clean ───┴──► publish ◄───┘ (bounded: 3 rounds)
```

1. **draft** the model proposes `{label, vair}` for one property, given that
   answer and the terms valid for that class. It proposes; it never writes.
2. **controls** deterministic checks, no model: term defined for the class,
   label is a name, label's words are in the answer, no two nodes carrying one
   term, no answer with content left empty. Cheapest first, so the critic is
   never paid to look at a draft that cannot be written.
3. **critic** a second model, given the answer and the draft but not the
   draft's justification, raises at most one finding per node and quotes the
   span it relies on.
4. **revise** only the nodes a finding named go back, with the finding text.
5. **publish** the draft is written with `provenance: "extracted"`, and
   unsettled findings ride along as `qual:reviewFlag` triples.

### Stopping rules

| Rule | Fires when | Result |
|---|---|---|
| `clean` | nothing objected | published unflagged |
| `fixpoint` | same node and flag twice running | published flagged |
| `cap` | 3 rounds | published flagged |
| `budget` | call limit for one property | published flagged, recorded |

**Every exit publishes.** A draft that failed review belongs in the graph with
its findings attached, because the graph is the editing surface. Withholding it
would leave the user with nothing to correct.

## Layout

```
agent.py             CLI: --qualification <id> | --serve | --dry-run
fill/workflow.py     FillRun (the steps), run_fill() for callers, and the six
                     BAF states whose bodies call the same steps
fill/controls.py     the deterministic checks
fill/agents.py       the writer and the critic, and the parsing of their answers
fill/prompts.py      the writer's and reviewer's prompts, built from prompts/
fill/clients.py      HTTP to the LLM service, the ontology service and the app
fill/models.py       Draft, Node, Finding, Round, Outcome
prompts/             reviewing-an-ontology-draft.md (the review pass)
```

The drafting prompt is **not** here: it is
`services/ontology/prompts/filling-the-airo-ontology.md`, kept beside the
vocabulary it is about, and `fill/prompts.py` reads it from there. One file, so
a change to the rule cannot apply to half the system.

## The model

BAF's own mechanism, and the only one in the app: a BAF LLM wrapper, chosen and
configured by environment variable, with the credential held in BAF's property
store (`fill/llm.py`).

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

Put those in the repo's `.env`. `docker compose` forwards all five variables to
this service; nothing else reads them, and the app itself makes no LLM calls at
all.

BAF imports each provider SDK lazily and only logs a warning when one is
missing, so a missing package appears as a `None` client at the first
prediction rather than at startup. `requirements.txt` pins `openai` and
`anthropic` for that reason.

## Running it

```bash
pip install -r requirements.txt

set -a; source ../../.env; set +a      # the same variables compose would pass
export APP_URL=http://localhost:3399
export ONTOLOGY_SERVICE_URL=http://localhost:8011

python agent.py --qualification <id> --dry-run   # draft, review, print, write nothing
python agent.py --qualification <id>             # and publish
uvicorn service:app --port 8012                  # the HTTP entry point the app calls
python agent.py --serve                          # BAF agent on the A2A platform
```

Temperature is 0: a draft should be reproducible.

## Tests

```bash
python -m pytest            # 100 tests, no network, no model
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
description of the flow and what BAF's monitoring database records, and a
function is what an HTTP request should call.

BAF checks state-body signatures by inspecting annotations, so a body must be
written `def body(session: Session) -> None:` with no `from __future__ import
annotations` in the module. PEP 563 string annotations fail that check with
`BodySignatureError`.
