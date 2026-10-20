# Changelog of AISC qualification (step 1: the web app and its Python services)

## 2026-10-16: straight into the AI system

- `/p/{project}` (the launcher's Qualify card) redirects to the AI system, which opens the latest AI card with its left menu, or the form for the first one. The welcome page and its styles are gone. Check: `test/unit/projectEntry.test.ts`.

## 2026-10-16: review fixes

From a review of the module and its contracts. One commit per finding on
feat/unified-modules.

- Web: every page under `/p/{pid}` asks the platform where it opens the project's database
  (`projectDbPastDoor`), once per request and shared with the layout and the other doors, so a request
  past a bypassed middleware reads nothing and records no `qualification.opened`. The card agent, let
  through by its service token, is not asked about. Check: `test/unit/pagesAskTheDoor.test.ts`.
- Web: the card agent's draft cites the `X-AISC-Request-Id` it sends, so `card.augmented_by_ai` is
  no longer rejected by the relay with the gateway check on. Check: `test/db/ledger.db.test.ts`.
- Web: a node correction is parsed strictly (the editor's four fields, typed, no NUL, capped) before
  it is built or stored; anything else is refused with a message naming the field. Check:
  `test/unit/nodePatchShape.test.ts`.
- Web: the JWKS read gives up after 3 seconds, a failed read is throttled like a successful one, and
  the request id is resolved once per request, before a transaction opens. Check:
  `test/unit/ledger/jwksTimeout.test.ts`.
- Web: `qualification.opened` is checked on a render of the card page. Check:
  `test/unit/ledger/cardOpenedEvent.test.ts`.
- Prefill: a bare Annex heading ("2(b)") ends the Components section, as it ends Risks, so the
  metadata and picks after it are proposed. Check: `services/prefill/tests/test_components.py`.
- Agents: a revision answer with no node list (prose, a truncated reply) keeps the draft; an explicit
  empty list still replaces it. Check: `services/agents/tests/test_rounds.py`.
- Agents: a failed run's status error is at most 300 characters with key-like text taken out; the
  full exception goes to the service's log only. Check: `services/agents/tests/test_service.py`.
- Card page: that error text reaches editors and owners only, as control-objectives shows a mapping
  run's error; a viewer's fill status says the run failed and nothing more. Check:
  `test/unit/fillStatusViewers.test.ts`.
- Docs: the agent runs when a person presses Refine with AI, not after a save.

## 2026-10-14: review pass

Areas: the web app (`src/`, `scripts/`, `test/`; branch pass/qual-web-2026-10-13) and the Python
services under `services/` (agents, ontology, prefill, PDF renderer; branch pass/qual-sidecars-2026-10-13).

### Security

- Web: the request id (`X-AISC-Request-Id`) is cited in ledger events and on calls to the platform and the agent only when a gateway token verifies against the realm's JWKS, was issued to `AISC_GATEWAY_CLIENT_ID` (default `aisc-gateway`), and any Bearer names the same person. New settings `AUTH_ENABLED` (default on), `KEYCLOAK_ISSUER`, `KEYCLOAK_JWKS_URL`; without the last two nothing is cited. Check: `test/unit/ledger/requestIdThroughGateway.test.ts`; on a stack, ledger events still carry a request id (the compose file must set the two Keycloak variables).
- Web: reading a document into the form (prefill) needs write access; a viewer posting the action is refused. Check: `test/unit/fileReadersCheckAccess.test.ts`.
- Web: the project layout asks the platform again before rendering under `/p/{pid}`. This did not protect the pages (Next renders a page beside its layout, not inside it); since 2026-10-16 every page asks where it opens the project's database. Check: `test/unit/projectLayoutDoor.test.ts`, `test/unit/pagesAskTheDoor.test.ts`.
- Web: another service's error text reaches a person as one line of at most 300 characters; the renderer's internal address and network error are logged, not shown. Check: `test/unit/upstreamErrorText.test.ts`.
- Prefill: the document readers are linear on a very long line (one upload used to hold the service for about 18 minutes), and the upload routes run off the event loop, so `/health` and other projects keep answering. Check: `services/prefill/tests/test_redos.py`.
- PDF renderer: WeasyPrint 70, FastAPI 0.142.2, Starlette 1.7.0, pydantic 2.13.5, Jinja 3.1.6; the URL fetcher still allows only `templates/` files and `data:` URIs. Prefill, ontology and agents take the same FastAPI, Starlette and uvicorn; agents pins its model clients. Check: each service's `tests/test_patched_dependencies.py`.
- Prefill, ontology, renderer: pytest and httpx move to `requirements-dev.txt`, so the images carry no test packages.

### Behaviour

- Web: a NUL character is refused before anything is written, naming the field (card form, question set and questionnaire drafts, self-contained import, ledger payloads); a card save no longer makes a version and then fails. Check: `test/unit/QualificationFormParser.test.ts`, `test/unit/ledger/canonical.test.ts`.
- Web: question set and questionnaire saves are numbered after the version the editor opened; a save from a stale editor gets "saved by someone else meanwhile. Reload it and save again." instead of overwriting. Check: `test/unit/staleFormsSave.test.ts`, `test/db/twoLevelFormsEdgeCases.db.test.ts`.
- Web: linking and unlinking a component lock the card row and record history and a ledger event only for a real change (a double click records one). Check: `test/unit/componentLinkOnce.test.ts`, `test/db/ledger.db.test.ts`.
- Web: a node correction replaces the stored entry, so "none applies" drops the old VAIR term and clearing the note removes it; an unchanged save records nothing. Check: `test/unit/ontologyServiceChecks.test.ts`, `test/unit/NodeEditor.test.tsx`.
- Web: the card page refreshes only for a run it saw in flight or started, so opening a card after a finished run no longer renders twice or records a second `qualification.opened`. Check: `test/unit/FillStatus.test.tsx`.
- Web: when the platform does not answer, the edit page says "The AI card cannot be edited right now" and offers no form (a save would have started the card over). Check: `test/unit/editSystemPage.test.tsx`.
- Web: `qualification.opened` records the card version's number under `version` (it recorded the provider's free-text version). Check: `test/unit/ledger/cardOpenedEvent.test.ts`.
- Web: `scripts/seed_mcas.mjs` with `SEED_FORCE=1` names the system on the platform first and replaces the card in one transaction; a card with a history is refused with a message. Check: `test/unit/seed.test.ts`.
- Agents: a revision replaces the property's draft, so a flagged node can be fixed or removed; a revision is reviewed once; `--serve` is removed. Check: `services/agents/tests/test_rounds.py`, `test_workflow.py`.
- Agents: a ledger error that is not an `OSError` no longer leaves a run "running" for ever; a run without a request id logs one warning. Check: `services/agents/tests/test_ledger.py`.
- Agents: a consistency finding's quote needs at least two content words on word boundaries ("quote too short" otherwise). Check: `services/agents/tests/test_consistency.py`.
- Prefill: an Annex heading ends the risk section; a hyphen inside a word no longer makes prose a metadata label. Check: `services/prefill/tests/test_risks.py`, `test_picks.py`, `test_fields.py`.
- Prefill: `/questionnaires/export` no longer answers 500 for an item without `setName`. Check: `services/prefill/tests/test_app.py`.
- PDF renderer: the PDF marks AI-drafted nodes ("AI draft from ...") and prints their open flags and the flagged count. Check: `services/system_card_renderer/tests/test_ai_draft_marks.py`; on a stack, download `ai-card.pdf` of a card the agent drafted.
- Ontology: starts without `airo_vocab.json` (the unused picker loader is removed; `AIRO_VOCAB_PATH` is no longer read); a `types` entry no longer joins a VAIR type the form already set. Check: `services/ontology/tests/test_app_root.py`, `test_build.py`.

### Removed

- `services/agents/Dockerfile`, `services/agents/config.yaml` and `services/agents/fill/llm.py` (unused; the stack builds `Dockerfile.stack`).
- 22 dead `eslint-disable` comments in `test/`, and tests that only re-read source text or duplicated a stronger test (a test audit); the three applied form migrations are pinned by sha256.

### How to check

- Web: `npx vitest run test/unit`, `test/db/throwaway-db.sh`, `npx tsc --noEmit`, `npm run lint`.
- Services: `cd services/<agents|ontology|prefill|system_card_renderer> && pip install -r requirements.txt -r requirements-dev.txt && python -m pytest` (agents has no `requirements-dev.txt`).
