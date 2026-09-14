<p align="center">
  <img src="public/laif-logo.svg" alt="Luxembourg AI Factory" width="220">
</p>

# AI System Qualification

> Answer what the EU AI Act asks, and get back a knowledge graph of your AI system.

Annex IV of [Regulation (EU) 2024/1689](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)
tells a provider what technical documentation to keep. This app asks those
questions, and turns the answers into a machine-readable description of the
system: individuals and relations shaped by the [AIRO](https://w3id.org/airo)
ontology and typed with the [VAIR](https://w3id.org/vair) vocabulary.

That graph **is** the AI card. It is not a summary written about your answers, it
is your answers restructured, and it downloads as JSON-LD, Turtle, JSON or PDF.

## Overview

- **14 questions** taken verbatim in intent from Annex IV points 1 and 2, each
  showing the sub-item it comes from. Four are optional, because the Annex
  itself qualifies them with "where applicable".
- **Closed pickers** for what the system does and where: 50 capabilities across
  14 categories, 23 sectors, 4 market forms, 4 kinds of setting.
- **One row per risk**, 8 fields following AIRO's risk chain: what could go
  wrong, what causes it, the weakness it exploits, what follows, who and what it
  affects, the control, and the control after that.
- **A knowledge graph per system**, rebuilt from those answers on every read and
  stored so it can be handed over unchanged.
- **A review loop** that drafts the two properties which can only come from
  prose, checks its own draft, and flags what it could not settle.

> [!NOTE]
> The app decides nothing about your system. Annex III classification is a legal
> judgement; this records what Annex IV asks you to document.

## How it works

```
form answers ─┐
tag pickers   ├─► ontology service ─► knowledge graph ─► AI card ─► JSON-LD / Turtle / JSON / PDF
risk rows     ┘         ▲                    │
                        │                    ▼
                  filler service ◄──── flagged nodes ──► you correct them
```

| service                         | port | role                                                           |
| ------------------------------- | ---- | -------------------------------------------------------------- |
| app (Next.js)                   | 3000 | the form, the list, the card, the methodology page             |
| `services/ontology`             | 8011 | holds AIRO and VAIR, builds each graph, computes the card view |
| `services/agents`               | 8012 | drafts the prose-derived nodes and reviews its own draft       |
| `services/system_card_renderer` | 8005 | renders a card as PDF                                          |
| Postgres                        | 5433 | qualifications, answers, risks, graphs                         |

**AIRO** gives the shape: an `AISystem` `hasPurpose` a `Purpose`, `hasRisk` a
`Risk`, a `Risk` `hasConsequence` a `Consequence` which `hasImpact` an `Impact`.
The app implements the core of its section 3.1: 19 classes and 19 properties of
AIRO's 46 and 52.

**VAIR** gives the words: `AssessingCreditworthiness`, `DeepLearning`,
`BiasedTrainingData`. A term is accepted only where VAIR defines it for that
node's own class, so 331 terms are offered across the 19 classes and nothing
else can be written.

Two properties cannot come from a picker, because the answers behind them are
paragraphs: the techniques of Annex IV 2(a) and the components of 2(c). The
filler drafts those, runs deterministic checks (is the term defined for this
class, is the label a name rather than a sentence, do its words appear in the
answer), then a second model reviews the draft against the answer. Up to three
rounds, and **every exit publishes**: what the loop could not settle arrives on
the node as a flag for you to clear.

> [!IMPORTANT]
> The Next.js app makes no LLM calls. The only model in the system belongs to the
> filler service, and the app works with it switched off: the card is built from
> your answers, with those two properties empty.

## Ontology and vocabulary

Both are published work of the ADAPT Centre, Trinity College Dublin, created by
Delaram Golpayegani with Harshvardhan J. Pandit and Dave Lewis, and both are
licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). They are
vendored here unmodified and checked by digest on every test run, so a graph
exported today resolves against the same definitions tomorrow.

**AIRO, the AI Risk Ontology, version 1.0** gives the schema: the classes and
the properties between them. Namespace `https://w3id.org/airo#`.
[w3id.org/airo](https://w3id.org/airo) ·
[repository](https://github.com/DelaramGlp/airo) ·
[doi:10.5281/zenodo.10894750](https://doi.org/10.5281/zenodo.10894750)

> Delaram Golpayegani, Harshvardhan J. Pandit, and Dave Lewis. AIRO: An ontology
> for representing AI risks based on the proposed EU AI Act and ISO risk
> management standards. Towards a Knowledge-Aware AI. IOS Press, 2022. 51-65.

**VAIR, the Vocabulary of AI Risks, version 1.0** gives the terms those classes
are filled with. Namespace `https://w3id.org/vair#`.
[w3id.org/vair](https://w3id.org/vair) ·
[repository](https://github.com/DelaramGlp/vair) ·
[doi:10.5281/zenodo.10894914](https://doi.org/10.5281/zenodo.10894914)

> Delaram Golpayegani, Harshvardhan J. Pandit, and Dave Lewis. To Be High-Risk,
> or Not To Be: Semantic Specifications and Implications of the AI Act's
> High-Risk AI Applications and Harmonised Standards. Proceedings of the 2023
> ACM Conference on Fairness, Accountability, and Transparency. 2023.

Both name the EU AI Act and the ISO 31000 series as their sources, and VAIR also
names ISO/IEC 22989:2023. Those standards are the definitions behind words like
risk source, consequence and impact, and this app uses them in that sense. The
[methodology page](#pages) repeats this attribution in the running app, beside
the step that uses each one.

## Getting started

```bash
npm install
cp .env.example .env        # DATABASE_URL, and a model key only if you want the filler
docker compose up -d        # db, ontology, agents, renderer
npx prisma migrate deploy
npm run dev
```

Open http://localhost:3000 and fill in the form, or open it on a worked example,
an invented consumer credit scorer detailed enough to answer every question:

```
http://localhost:3000/qualify/new?example=mcas
```

Nothing is written until you press save, and every field stays editable.

### Seeding

```bash
npx prisma db seed      # MicroCredit Assist Score, the worked example
npm run db:seed         # a set of shorter example qualifications
```

`prisma db seed` writes one complete qualification: 14 Annex IV answers, five
risk chains and a curated draft of the two properties the filler would otherwise
have to extract. It is what the deployment runs, so a stack comes up with
something to open. Running it again changes nothing, and it never overwrites a
card you have edited; `SEED_FORCE=1 npx prisma db seed` replaces it.

## Choosing a model

The filler configures its model through the
[BESSER Agentic Framework](https://github.com/BESSER-PEARL/BESSER-Agentic-Framework),
which holds the credential in its own property store. Thirteen providers are
wired, including one that needs no key at all:

```bash
BAF_LLM_PROVIDER=anthropic          # or mistral, openai, google, groq, ollama, compatible, ...
BAF_LLM_MODEL=claude-sonnet-5
ANTHROPIC_API_KEY=...
```

`ollama` runs a model on your own machine, and `compatible` points at any
OpenAI-compatible endpoint through `BAF_LLM_BASE_URL`. See
[`services/agents/README.md`](services/agents/README.md) for the full table.

> [!WARNING]
> Keys belong in `.env`, which is git-ignored. A test fails the build if a
> credential ever reaches a tracked file.

## What you get back

| endpoint                                   | what it is                                                   |
| ------------------------------------------ | ------------------------------------------------------------ |
| `/api/qualifications/[id]/ontology.jsonld` | the graph itself; parsing it back gives the same triples     |
| `/api/qualifications/[id]/ontology.ttl`    | the same graph as Turtle                                     |
| `/api/qualifications/[id]/ai-card.json`    | the card view and the graph together, with the Act citations |
| `/api/qualifications/[id]/ai-card.pdf`     | the card rendered for a reader                               |

Each graph carries the digests of the AIRO and VAIR files it was built against,
so an exported file says what defined it. Downloads serve the stored bytes, and
keep working while the ontology service restarts.

## Pages

- `/qualify/new` — the form
- `/qualifications` — everything saved, newest first
- `/qualify/[id]` — one qualification: the answered form, and the AI card in its
  graph and vertical views
- `/methodology` — the eight steps from a filled form to a downloadable card,
  and the published work each rests on

## Tests

```bash
npm test                                               # 276
(cd services/ontology && python -m pytest)             # 172
(cd services/agents && python -m pytest)               # 100
(cd services/system_card_renderer && python -m pytest) #   9
```

None of them needs a network, a model, or a running service.

## Deployment

Self-hosts on a single server with Docker, or runs as a submodule of the aisc
platform against a shared Postgres. See [DEPLOY.md](DEPLOY.md).

---

##  License

This project is licensed under the [Apache License 2.0](LICENSE).  
© 2024–2026 Université du Luxembourg and Luxembourg Institute of Science and Technology (LIST).
