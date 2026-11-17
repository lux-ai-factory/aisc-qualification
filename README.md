# AISC Qualification Service

Backend-only AI qualification: a project's answers to the **Annex IV of the EU AI Act**
questionnaire come in, the filled **AIRO 3.1 graph** (the "AI card") goes out. It has no
UI of its own — the webapp renders the card through the AISC backend, which owns all data.
This service is stateless compute only.

## Endpoints

All API routes require the service token (`X-AISC-Service-Token:
<BACKEND_TO_QUALIFICATION_TOKEN>`); `/health` is open.

### `POST /api/build` — the only write

Called by the AISC backend to build the AI card for a project's answers.

Request:

```json
{
  "project_pid": "uuid-of-the-project",
  "questionnaire_id": "annex-iv-default",
  "questionnaire": {"name": "Annex IV", "blocks": {}, "questions": []},
  "answers": {"q:annex-1:1a": "first release", "__blocks": {}},
  "system": {"name": "Credit scorer", "version": "1.0", "company": "Acme"}
}
```

`questionnaire` may be `{}`: the service then fills in its built-in Annex IV
default. `system` is optional (the card falls back to a local URN).

Response:

```json
{
  "view": { "system": {}, "rows": [], "chains": [], "coverage": {} },
  "jsonld": "[ ... ]",
  "turtle": "@prefix airo: ...",
  "problems": [],
  "digest": "sha-of-the-graph"
}
```

- `view` — the card the webapp renders (system, rows, chains, coverage).
- `jsonld` / `turtle` — the filled AIRO 3.1 graph in both serialisations.
- `problems` — validation findings (empty when the graph is valid AIRO).
- `digest` — stable identity: a rebuild of the same answers gives the same
  digest, so the backend can tell a real state change from a re-render.

If every build retry is refused (e.g. an invalid VAIR term survives), the door
answers `502`, never a successful stub card.

### `GET /api/default-questionnaire`

The builtin Annex IV questionnaire (`annex-iv-default`, 14 questions + blocks),
owned by this service. The backend falls back to an empty definition when the
service is absent.

### `GET /api/vocabularies`

The VAIR term lists per AIRO class, derived from the vendored `vair.ttl` — the
same lists the builder validates against, so the webapp can never offer a term
the builder would refuse.

### `GET /health`

Open probe used by the stack's readiness checks.

## Layout

```
src/                 service code
  app.py            FastAPI entry (uvicorn app:app)
  card.py           card assembly contract
  ontology.py       answer → AIRO qualification mapping + in-process build
  schemas.py        request/response shapes
  airo_min/         the vendored AIRO 3.1 graph builder
  airo/             AIRO + VAIR ontologies (TTL)
data/               shared vocabularies (airo_vocab.json, annex_points.json)
tests/              builder + service contract tests
examples/           MCAS qualification fixtures used by the tests
```

## Run

```sh
uv sync
uv run uvicorn app:app --reload --port 8000
```

The service reads `data/` from the repo root and, in the image, from beside the package.
Override the lookups with `AIRO_VOCAB_PATH` / `ANNEX_POINTS_PATH` if needed.

## Test

```sh
uv run pytest
```

## Build

```sh
docker build -f Dockerfile .
```

The image copies `src/` to `/app` (so `app:app` resolves) and the vocabularies beside
the package.

## License

Apache 2.0. The vendored AIRO and VAIR ontologies are redistributed under CC BY 4.0 —
see [NOTICE.md](NOTICE.md).
