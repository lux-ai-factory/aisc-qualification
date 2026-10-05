<p align="center">
  <img src="public/laif-logo.svg" alt="Luxembourg AI Factory" width="220">
</p>

# AI System Qualification

## What it is

This is step 1 of AISC, the AI Assessment Sandbox Configurator. AISC walks a project through six
steps: 1 qualification, 2 control objectives, 3 install plugins and tools, 4 execute tests and
address controls, 5 analyse results on the dashboard, 6 compose the report. In this step a person
describes the project's AI system by answering the questions Annex IV of the EU AI Act
([Regulation (EU) 2024/1689](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)) asks a provider to
document. The app turns the answers into the system's **AI card**: a knowledge graph shaped by the
[AIRO](https://w3id.org/airo) ontology and typed with the [VAIR](https://w3id.org/vair) vocabulary.
The card can be downloaded as JSON-LD, Turtle, JSON or PDF. Step 2 (control objectives) reads it to
start an assessment. Every save makes a new card version, and earlier versions stay readable.

The app decides nothing about the system. Annex III classification is a legal judgement; this
records what Annex IV asks to document.

## How it works

```
browser ── gateway (Caddy + oauth2-proxy + Keycloak) ── qualification-web (Next.js, this repo)
                                                          │
            ┌───────────────┬────────────────┬────────────┼──────────────┬──────────────────┐
            ▼               ▼                ▼            ▼              ▼                  ▼
   qualification-   qualification-   qualification-  qualification-  platform           project database
   ontology         agents           prefill         pdf             (who may do what,  (schema
   (graph builder)  (card agent,     (document to    (PDF renderer)   card versions,     `qualification`)
                     uses a model)    form answers)                   ledger relay)
```

- **qualification-web** (`src/`) is a Next.js 15.5 app (React 19). It serves the form, the card pages and the
  download routes under `/qualification/p/<project pid>/...`. It stores everything in the
  `qualification` schema of the project's own Postgres database (one database per project, made by
  the platform), through Prisma. For every request under `/p/` it asks the platform whether the
  signed-in person is in the project and may change it (`src/middleware.ts`). It makes no model
  calls itself.
- **Python services** under `services/`, each a small FastAPI app with its own Dockerfile:

  | Directory | Compose service | Port | What it does |
  | --- | --- | --- | --- |
  | `services/ontology` | `qualification-ontology` | 8011 | Holds AIRO and VAIR. `POST /build` turns a card's answers, the agent's extraction and a reviewer's edits into the filled AIRO graph and the card view. No model. Without it the app can store answers but cannot build or export a card. See [its README](services/ontology/README.md). |
  | `services/agents` | `qualification-agents` | 8012 | The card agent, built on the [BESSER Agentic Framework](https://github.com/BESSER-PEARL/BESSER-Agentic-Framework) (BAF). After a save, the app calls `POST /fill/{pid}/{id}`. The agent reads the card from the app, drafts the nodes that only prose answers can give (techniques from Annex IV 2(a), components from 2(c)), checks the draft, has a second model review it, and publishes it back to the app with flags on what it could not settle. It also proposes short names for long answers and points out choices that contradict the answers. It uses the model the project chose on the platform, or the `BAF_LLM_*` variables. See [its README](services/agents/README.md). |
  | `services/prefill` | `qualification-prefill` | 8012 | Reads a document someone already wrote (.pdf, .docx, .txt, .md) and proposes answers for the form (`POST /prefill`). It also imports and exports question sets and questionnaires as CSV, Markdown, Word or JSON files. Text rules only, no model, stores nothing. See [its README](services/prefill/README.md). |
  | `services/system_card_renderer` | `qualification-pdf` | 8005 | Renders a card as HTML or PDF with Jinja and WeasyPrint (`POST /render/pdf`). |

  Every service except `/health` refuses a caller that does not send its own token in the
  `X-AISC-Service-Token` header (`service_token.py`, the same file in each service). A service whose
  expected tokens are not set answers 503.
- **Platform** (`platform/` in the aisc repo): the app asks it who may see or change a project
  (`/authz/projects/{pid}`), asks it to create the next card version (a row of `project.system`),
  and reads the project's model choice through it. When the ledger is on, each change writes its
  event with `ledger.emit` in the project database, in the same transaction as the change, and the
  platform relays it to the immudb ledger.
- **Engine backend** (`aisc-backend`): read only, to list the AI system components a card can link.

## Install and run

### Inside the AISC stack (the usual way)

The app is the submodule `apps/qualification` of the aisc repo. Its services are defined in the aisc
repo's `docker-compose.development.yml`: `qualification-web`, `qualification-migrate`,
`qualification-ontology`, `qualification-agents`, `qualification-prefill` and `qualification-pdf`.
From the aisc repo root:

```bash
./scripts/secrets.sh        # once: writes env.secrets and env.runtime (the service tokens among them)
docker compose -p aisc --env-file env.runtime -f docker-compose.plugin_downloader.yml \
  -f docker-compose-infra.development.yml -f docker-compose.development.yml up -d --build
```

The compose file refuses to start the qualification services until `scripts/secrets.sh` has written
their tokens. `qualification-migrate` runs first: it applies `prisma migrate deploy` to every project
database (`scripts/migrate-projects.mjs`) and exits; `qualification-web` starts only when it has
succeeded. A project created later is migrated by the web app the first time it is opened.

To rebuild only this app after a change: `... up -d --build qualification-web qualification-migrate`
(same `-p`, `--env-file` and `-f` options).

Open http://localhost:8100, sign in, create or open a project, and choose step 1. The app is served
by the gateway at `http://localhost/qualification/p/<project pid>/`. To open the form already filled
with the worked example (MicroCredit Assist Score, an invented consumer credit scorer), add
`system/edit?example=mcas` to that address. Nothing is stored until you save.

### Standalone, for development

Prerequisites: Node 20 and npm (the image uses `node:20-alpine`), Python 3.12 for the services, and
Docker for the database tests.

```bash
npm ci
npx prisma generate
npm run typecheck
npm run lint
npx vitest run              # the unit tests, no database needed
npm run build
```

`npm run dev` starts the dev server on port 3000, but the project pages need what the stack gives
them: `PROJECT_DATABASE_URL` pointing at a Postgres whose project databases the platform created,
and `PLATFORM_URL` pointing at a running platform. Without a platform, every page under `/p/`
answers 503. `/methodology` works without either. In practice, develop against the stack and
rebuild the container, or rely on the tests.

A Python service on its own (one virtual environment per service):

```bash
cd services/ontology                       # or agents, prefill, system_card_renderer
python3.12 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
QUALIFICATION_WEB_TO_ONTOLOGY_TOKEN=dev-web QUALIFICATION_AGENTS_TO_ONTOLOGY_TOKEN=dev-agents \
  uvicorn app:app --port 8011
```

The agents service also needs `fastapi` and `uvicorn` (its Dockerfile installs them) and is started
with `uvicorn service:app --port 8012`. The ontology and prefill images are built from the app root
(`docker build -f services/ontology/Dockerfile .`), because they copy shared data from `src/data`.
Each service's tokens are the ones named in the table below.

This repo has no compose or env files of its own: the app needs the platform, the project databases
and the service tokens, which the aisc repo's compose files bring up. Use those.

### Seeding the worked example

`scripts/seed_mcas.mjs <project pid>` (or `SEED_PROJECT=<pid>`) writes the complete MCAS card into a
project database: 14 Annex IV answers, five risk chains and a curated draft of the two prose-derived
properties. Running it again leaves an existing card alone; `SEED_FORCE=1` replaces it. It asks the
platform (`PLATFORM_URL`) to create the card version without sending a token, so the authenticated
platform of the stack refuses it. The tests call its `seedMcas` function with the platform's answer
instead. In the stack, open the form with `?example=mcas` as above.

## Configuration

### qualification-web (and qualification-migrate)

| Variable | Meaning | Default |
| --- | --- | --- |
| `PROJECT_DATABASE_URL` | Template of a project database URL; `{database}` becomes `project_<pid without hyphens>`. The app always forces `schema=qualification` and `connection_limit=2`. | none (required). The stack sets `postgresql://qualification_rw:...@postgres:5432/{database}?...`, overridable with `QUALIFICATION_PROJECT_DATABASE_URL`. |
| `DATABASE_URL` | Read only by the Prisma CLI. `scripts/migrate-projects.mjs` and the app set it per project database when they run `prisma migrate deploy`. | none |
| `PLATFORM_URL` | The platform: access checks, card versions, project names. | none (project pages answer 503 without it) |
| `LAUNCHER_URL` | Where a reader without a project is sent. | `http://localhost:8100/` |
| `AISC_BACKEND_URL` | The engine backend, read for the AI system's components. | none (no components listed) |
| `ONTOLOGY_SERVICE_URL` | The ontology service. | none (building or exporting a card fails) |
| `AGENT_SERVICE_URL` | The card agent. | none (no draft is requested) |
| `PREFILL_URL` | The prefill service. | none (document reading and form files are unavailable) |
| `SYSTEM_CARD_RENDERER_URL` | The PDF renderer. | `http://localhost:8005` |
| `NEXT_BASE_PATH` | Path prefix the app is served under. A build argument and a runtime variable (`next.config.ts` reads it at start). | empty (served at `/`); the stack uses `/qualification` |
| `LEDGER_MODE` | `off`, `record` or `enforce`. Events are written only in `record` and `enforce`. | `off` |
| `QUALIFICATION_WEB_TO_AGENTS_TOKEN`, `QUALIFICATION_WEB_TO_ONTOLOGY_TOKEN`, `QUALIFICATION_WEB_TO_PREFILL_TOKEN`, `QUALIFICATION_WEB_TO_PDF_TOKEN` | The token this app sends to each service. | none (the service refuses the call) |
| `QUALIFICATION_AGENTS_TO_WEB_TOKEN` | The token the card agent must send to read and publish a card's `extracted` document (`/p/{pid}/api/qualifications/{id}/extracted`). | none (the agent is refused) |
| `SEED_PROJECT`, `SEED_FORCE` | Used only by `scripts/seed_mcas.mjs`. | none |

All tokens are generated by `scripts/secrets.sh` in the aisc repo. Never commit one.

### Python services

| Service | Variable | Meaning | Default |
| --- | --- | --- | --- |
| ontology | `QUALIFICATION_WEB_TO_ONTOLOGY_TOKEN`, `QUALIFICATION_AGENTS_TO_ONTOLOGY_TOKEN` | Tokens of its two callers. | none (503) |
| ontology | `AIRO_VOCAB_PATH`, `ANNEX_POINTS_PATH` | Override where `airo_vocab.json` and `annex_points.json` are read from. | beside the package (image), else `src/data` |
| agents | `QUALIFICATION_WEB_TO_AGENTS_TOKEN` | Token of its caller (the app). | none (503) |
| agents | `QUALIFICATION_AGENTS_TO_WEB_TOKEN`, `QUALIFICATION_AGENTS_TO_ONTOLOGY_TOKEN` | Tokens it sends to the app and to the ontology service. | none |
| agents | `APP_URL` | The app, including its base path. | `http://localhost:3399` |
| agents | `ONTOLOGY_SERVICE_URL` | The ontology service. | `http://localhost:8011` |
| agents | `HTTP_TIMEOUT` | Seconds for each HTTP call. | `120` |
| agents | `PLATFORM_URL`, `PLATFORM_INTERNAL_TOKEN` | Where and with which token it reads the model the project chose. | none (the environment's model is used) |
| agents | `BAF_LLM_PROVIDER`, `BAF_LLM_MODEL` | The model used when the project chose none. | `mistral`, `mistral-large-latest` |
| agents | `BAF_LLM_BASE_URL`, `BAF_LLM_API_KEY` | Endpoint and key for the `ollama` and `compatible` providers. | none |
| agents | `MISTRAL_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, ... | The provider's key; the full table is in [services/agents/README.md](services/agents/README.md). | none |
| agents | `LEDGER_MODE`, `PLATFORM_LEDGER_AGENTS_TOKEN` | Whether a run's events go to the platform's ledger route, and the token for it. | `off`, none |
| agents | `FILL_PROMPTS_PATH` | A directory searched first for the prompt files. | none |
| prefill | `QUALIFICATION_WEB_TO_PREFILL_TOKEN` | Token of its caller. | none (503) |
| prefill | `PREFILL_MAX_BYTES` | Largest upload accepted. | `10485760` (10 MiB) |
| prefill | `PREFILL_MAX_UNZIPPED_BYTES` | Largest total size of the parts of a .docx. | `52428800` (50 MiB) |
| prefill | `PREFILL_FIELDS_PATH`, `PREFILL_VAIR_VOCAB_PATH` | Override where the field mapping and the VAIR lists are read from. | beside the package (image), else `src/data` |
| pdf | `QUALIFICATION_WEB_TO_PDF_TOKEN` | Token of its caller. | none (503) |

## Tests

**Never point a test at the live database.** The running stack's Postgres listens on port 5432
(`127.0.0.1:5432`); the database tests refuse that port, and the throwaway script refuses it too.

```bash
npx vitest run                  # or npm test: unit and component tests; the database tests skip
test/db/throwaway-db.sh         # the database tests, against a throwaway Postgres (see below)
```

`test/db/throwaway-db.sh` starts a Postgres container on a random port, creates the platform
database and project databases the way the platform does, applies this app's migrations, runs
`npx vitest run test/db` and removes the container. It needs Docker, `uv`, and this repo checked
out inside the aisc repo (it reads `init/` and `platform/` from there). `KEEP=1
test/db/throwaway-db.sh` leaves the container running and prints the `QUALIFICATION_TEST_*`
variables to export for running single database tests by hand.

`test/chain/chain.test.ts` is one step of the aisc repo's pipeline chain
(`scripts/test-pipeline-chain.sh`) and skips unless `CHAIN_JSON` is set.

Several unit tests read source files as text (for example the Dockerfile, the npm scripts and some
pages), so a change to wording in those files can fail a test.

The Python services, each in its own virtual environment with its `requirements.txt` and `pytest`:

```bash
cd services/agents && python -m pytest       # likewise ontology, prefill, system_card_renderer
```

None of them needs a network, a model or a running service.

## Layout

```
src/app/            pages and API routes (Next.js App Router), all under /p/[project]/ except /methodology
src/server/         services, repositories, form parsing, access checks, ledger events
src/domain/         card, card versions, components and form-builder logic, no I/O
src/data/           the form's vocabularies (AIRO, VAIR, Annex IV points), shared with the Python services
src/lib/            project database connections, launcher link, prefill helpers
src/components/     shared React components
src/middleware.ts   the per-request project access check
prisma/             schema.prisma and the migrations applied to every project database
scripts/            migrate-projects.mjs, seed_mcas.mjs, export_qualification.mjs
services/           the Python services described above
test/unit, test/db  vitest tests; test/support and test/fixtures hold their helpers and data
```

## For contributors

- **Branch:** `feat/unified-modules` is the only branch to work on.
- **Migrations:** add a new directory under `prisma/migrations`; never edit one that has been
  applied, because Prisma records each migration's checksum in every project database. Migrations
  run in each project database, which the platform creates with the `project` schema already in
  place, so they cannot be applied to an empty Postgres (the throwaway script prepares one).
  Before deploying `20260925150000_two_level_forms` to a database that predates it, dump its
  `qualification` schema: that migration drops the old form tables in the same transaction that
  copies them, and there is no down migration.
- **Prompts:** the `.md` files under `services/*/prompts` are read by the card agent at run time;
  the drafting prompt lives in `services/ontology/prompts` and is copied into the agents image.
- **Shared data:** `src/data/*.json` is read by both the app and the ontology and prefill services.
  `python -m airo_min.vair_vocab --write`, run in `services/ontology`, regenerates
  `src/data/vair_vocab.json`.
- **Keys:** model keys belong in the stack's environment, never in a tracked file; a test fails if
  a credential reaches one.

## Ontology and vocabulary

Both are published work of the ADAPT Centre, Trinity College Dublin, created by Delaram Golpayegani
with Harshvardhan J. Pandit and Dave Lewis, and both are licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). They are vendored in `services/ontology/airo`
unmodified and checked by digest in the tests, and each graph records the digests of the files it
was built against.

**AIRO, the AI Risk Ontology, version 1.0** gives the classes and the properties between them.
Namespace `https://w3id.org/airo#`. [w3id.org/airo](https://w3id.org/airo) ·
[repository](https://github.com/DelaramGlp/airo) ·
[doi:10.5281/zenodo.10894750](https://doi.org/10.5281/zenodo.10894750)

> Delaram Golpayegani, Harshvardhan J. Pandit, and Dave Lewis. AIRO: An ontology for representing AI
> risks based on the proposed EU AI Act and ISO risk management standards. Towards a
> Knowledge-Aware AI. IOS Press, 2022. 51-65.

**VAIR, the Vocabulary of AI Risks, version 1.0** gives the terms those classes are filled with.
Namespace `https://w3id.org/vair#`. [w3id.org/vair](https://w3id.org/vair) ·
[repository](https://github.com/DelaramGlp/vair) ·
[doi:10.5281/zenodo.10894914](https://doi.org/10.5281/zenodo.10894914)

> Delaram Golpayegani, Harshvardhan J. Pandit, and Dave Lewis. To Be High-Risk, or Not To Be:
> Semantic Specifications and Implications of the AI Act's High-Risk AI Applications and Harmonised
> Standards. Proceedings of the 2023 ACM Conference on Fairness, Accountability, and Transparency.
> 2023.

Both name the EU AI Act and the ISO 31000 series as their sources, and VAIR also names
ISO/IEC 22989:2023. The app's `/methodology` page repeats this attribution beside the step that uses
each one.

## What you get back

| Route (under `/qualification/p/<pid>`) | What it is |
| --- | --- |
| `api/qualifications/[id]/ontology.jsonld` | The card's knowledge graph as JSON-LD. |
| `api/qualifications/[id]/ontology.ttl` | The same graph as Turtle. |
| `api/qualifications/[id]/ai-card.json` | The card view and the graph together, with the Act citations. |
| `api/qualifications/[id]/ai-card.pdf` | The card rendered as PDF (`system-card.pdf` is the same handler). |
| `api/system-versions/[systemPid]/ontology.jsonld` | The graph of one card version, which step 2 reads. |

Downloads serve the stored graph, so they keep working while the ontology service restarts.

## License

This project is licensed under the [Apache License 2.0](LICENSE.md).
© 2024–2026 Université du Luxembourg and Luxembourg Institute of Science and Technology (LIST).

