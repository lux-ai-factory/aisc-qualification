# AGENTS.md — aisc-qualification

**Target state:** a compliance domain *feature inside* the `backend` and `webapp` layers.
**Today:** a standalone application with its own frontend, services and Prisma schema (a vertical
slice).

## Read first

The binding rules live in the parent repository, `lux-ai-factory/aisc`:
`ARCHITECTURE.md`, especially **I9** and **I10**, and `docs/refactor-plan.md` §2.7.

## What binds this repo

- **I9** — a domain must not re-implement a layer: its UI belongs in `webapp`, its API and models in
  `backend`, its execution in `eval`.
- **I5** — one migration tool: today this repo carries its own Prisma schema and migrations.
- **I10** — the core must run with this domain absent; dependencies point coreward.

## Do not

- grow the slice: put new endpoints, models or pages in `backend` / `webapp` behind a feature flag.