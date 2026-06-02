# AI System Qualification

Self-hosted Next.js app for qualifying AI systems against the EU AI Act and generating
system cards. LLM work goes through a **LiteLLM service** (no provider SDK or API key
in the app itself). The app is open — there is no login or account management; every
qualification is shared.

## Stack

- **Next.js 15** (App Router, Server Actions)
- **Prisma** + **Postgres 16** (self-hosted via Docker)
- **TypeScript**, Zod for validation
- **LiteLLM service** (`services/llm`, FastAPI + `litellm`) — the single,
  provider-agnostic LLM endpoint; the provider key lives here, not in the app
- **Python renderer** (`services/system_card_renderer`, FastAPI + Jinja2 + WeasyPrint)
  for the system-card PDF

## Quick start

```bash
npm install
cp .env.example .env        # set MISTRAL_API_KEY (used by the llm service)
docker compose up -d        # db + llm + system-card-renderer
npx prisma migrate dev
npm run dev
```

Open http://localhost:3000. The app talks to the LiteLLM service on
`http://localhost:4000` and the renderer on `http://localhost:8005`.

## Seed demo data (optional)

The app starts empty. To explore it with sample qualifications, seeding is
**opt-in** — it is never run automatically. After the database is migrated:

```bash
npm run db:seed         # a set of example qualifications (one with a pre-generated card)
npm run db:seed:mcas    # one additional example qualification
```

Both are idempotent-friendly demo helpers; skip them entirely if you'd rather
start from a clean slate and create qualifications through the UI.

## Running as an aisc platform app (apps/qualification)

Platform-mode files run it as a submodule of the aisc platform against the shared
Postgres, with the LLM + renderer as sidecars:

- `Dockerfile` builds the Next.js app (`NEXT_BASE_PATH` arg for subpath routing).
- `docker-compose.development.yml` — `qualification-web` / `qualification-llm` /
  `qualification-pdf`, no bundled `db`, on the platform `backend`/`frontend` networks.
- `env.development` — service-name hosts (`postgres`, `qualification-llm`,
  `qualification-pdf`).

A `qualification` database must exist in the shared Postgres, the provider key must
be available to `qualification-llm`, and a Caddy route `/qualification` → `qualification-web:3000`.

## What's here

- `/` — welcome page
- `/qualify/new` — multi-section qualification form, derived from the Article
  10 / 12 / 13 / 14 evaluation tools
- `/qualify/[id]` — a saved qualification with a "Generate system card" action
- `/qualifications` — all saved qualifications
- `/api/qualifications/[id]/system-card.json` / `.pdf` — export endpoints

## Deploy

See [DEPLOY.md](./DEPLOY.md).
