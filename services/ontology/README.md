# Ontology service and airo_min

This service builds the AI card of step 1 (Qualify the AI system): it turns a
card's answers into a graph shaped by the AIRO ontology and typed with the VAIR
vocabulary. In the AISC stack it is the `qualification-ontology` service (port
8011, `app.py`). It has no model and stores nothing. Without it qualification-web
can store answers but cannot show, download or hand a card to step 2. What step
1 is for is in `docs/appendices/1-qualify.md` of the aisc repo.

- `GET /vocabularies`: the VAIR terms a reviewer may pick, per AIRO class.
- `POST /build`: a card's answers, the card agent's `extracted` draft and a
  reviewer's patch in; the filled graph (Turtle and JSON-LD), its card view,
  validation problems and a digest of the graph out. A VAIR term or picker id
  the builder does not know is a 422.
- `GET /health`: open, no token.

Callers send their token in `X-AISC-Service-Token`: qualification-web
(`QUALIFICATION_WEB_TO_ONTOLOGY_TOKEN`) and the card agent
(`QUALIFICATION_AGENTS_TO_ONTOLOGY_TOKEN`). A wrong or missing token is 401; with
neither token set the service answers 503.

The one file of the app's `src/data` the service reads is `annexPoints.json`
(the 14 Annex IV points); the form's `airo_vocab.json` is not read here. It is
looked for at `ANNEX_POINTS_PATH` when set, then in `src/data` when the service
runs from the app, then as `airo_min/annex_points.json`, where the image copies
it. So the image is built from the app root
(`docker build -f services/ontology/Dockerfile .`).

The builder underneath is the `airo_min` package: AIRO's minimal core schema (documentation section 3.1, Figure 3) as a Python package,
with stakeholders simplified to Operator, User and Subject: 22 classes, 24 object properties,
9 subclass edges. IRIs are AIRO's own, so output is valid AIRO.

- `airo_min/schema.py`   the schema as data, cross-checked against `airo/airo.ttl`
- `airo_min/app_root.py` where the app root is, for the modules that read its src/data
- `airo_min/graph.py`    build and serialise instance graphs (Turtle, JSON-LD)
- `airo_min/validate.py` structural validation: known terms, domains, ranges
- `airo_min/mapping.py`  form field to AIRO property; its test proves the form can
                         fill every property

- `airo_min/vair_vocab.py` the VAIR lists the form offers, written to
                         src/data/vair_vocab.json (`python -m airo_min.vair_vocab --write`)
- `airo_min/vair_terms.py` the VAIR terms each AIRO class may take, read from the vendored vair.ttl
- `airo_min/annex_points.py` the 14 Annex IV points, shared with the app
- `airo_min/build.py`    a saved card to a filled graph, plus a CLI
- `airo_min/patch.py`    a reviewer's corrections, applied on top of the built graph
- `airo_min/view.py`     the card view the app renders
- `airo_min/coverage.py` how much of Annex IV a card covers

In the AISC stack, `uv run scripts/aisc.py start` from the aisc folder builds and
starts it with its tokens. On its own, and its tests:

```bash
python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt
.venv/bin/pytest
QUALIFICATION_WEB_TO_ONTOLOGY_TOKEN=dev-web QUALIFICATION_AGENTS_TO_ONTOLOGY_TOKEN=dev-agents \
  .venv/bin/uvicorn app:app --port 8011
```

## Filling the ontology from a qualification

```bash
# in apps/qualification: Node owns the database and the taxonomies
PROJECT_DATABASE_URL=... node scripts/export_qualification.mjs --project <pid> --name "MicroCredit" --out mcas.json

# here: Python owns the ontology
.venv/bin/python -m airo_min.build mcas.json --extracted mcas.extracted.json \
    --format turtle --out mcas.ttl
```

Structured form fields (tags, pickers, the Components block, risk rows) map
deterministically. One property lives inside prose, `usesTechnique` in answer
2(a), and comes from the `--extracted` file: that is the slot the card agent's
draft fills. Without it the techniques are absent rather than invented.
`extracted` may also carry `components` (`hasComponent`, Annex IV 2(c)); they are
used only when the card's Components block has no rows, and the card agent
drafts none. Its `types` entries give
a VAIR term only to a node that has none: a node the form already typed keeps
that one term, and an entry for it is skipped (still checked against its class).

The Annex IV answers are preserved verbatim as `qual:answer` annotations on the
AISystem, each with its Annex IV citation, in AISC's own namespace
(`qual:`, `https://lux-ai-factory.github.io/qualification/ns#`). The AIRO structure
therefore stays at exactly the schema's 24 properties while the graph still carries 100% of the
technical documentation.

## Granularity: read the prompt first

`prompts/filling-the-airo-ontology.md` is the rule for how many nodes an answer
becomes. Short version: VAIR's term list sets the granularity, not the prose. VAIR names
17 techniques and 22 component kinds for every AI system that will ever exist, so one system
gets 1 to 3 techniques and one node per kind of part, never one per noun phrase in an
answer. Labels are names of at most 60 characters; the detail is already attached verbatim
as `qual:answer` with its Annex IV citation.

Without that rule, a model drafts one node per noun phrase: for MCAS, six `AITechnique`
nodes from a vocabulary whose terms are closed, one of them "a fixed version-controlled
system prompt". The card agent loads the file as its system prompt before drafting
(its image copies this `prompts/` directory).

## The worked example: MCAS

`examples/` holds a real qualification end to end, rebuilt and checked by
`tests/test_example_mcas.py` on every run, with no database needed:

| file | what it is |
|---|---|
| `mcas.qualification.json` | the saved form, exported: 14 Annex IV answers, 5 risk rows, all pickers |
| `mcas.extracted.json` | the curated prose extraction (techniques, components) |
| `mcas.ttl` / `mcas.jsonld` | the filled AIRO graph, 456 triples |

MicroCredit Assist Score v1.2.0 is an invented consumer-credit scoring system,
the kind of use Annex III 5(b) lists (the graph records the domain; it does not
classify the system). Its graph instantiates 20 of the 22 classes (`Stakeholder` and
`RiskConcept` are abstract parents, never instantiated directly), uses 23 of the 24
properties (not `hasTestingData`), and asserts 38 VAIR terms.

Deliberately not here: the Annex III SHACL classifier from the AIRO repo (as shipped,
none of its 103 property shapes has `sh:minCount`, so every AISystem matches all 28
shapes), and the AIRO classes outside Figure 3 (`AISubject` is the exception: it holds the
people a risk affects).
See `NOTICE` for licences.
