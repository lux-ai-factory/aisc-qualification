# airo_min

AIRO's minimal core schema (documentation section 3.1, Figure 3) as a Python package,
with stakeholders simplified to Operator and User: 19 classes, 19 object properties,
6 subclass edges. IRIs are AIRO's own, so output is valid AIRO.

- `airo_min/schema.py`   the schema as data, cross-checked against `airo/airo.ttl`
- `airo_min/vocab.py`    picker vocabularies (VAIR terms), shared with the form via
                         `../../src/data/airo_vocab.json`
- `airo_min/graph.py`    build and serialise instance graphs (Turtle, JSON-LD)
- `airo_min/validate.py` structural validation: known terms, domains, ranges
- `airo_min/mapping.py`  form field to AIRO property; its test proves the form can
                         fill every property

- `airo_min/vair_map.py`  our form taxonomies to VAIR's controlled terms, where the
                         mapping is unambiguous
- `airo_min/build.py`    a saved qualification to a filled graph, plus a CLI

Test:

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/pytest
```

## Filling the ontology from a qualification

```bash
# in apps/qualification: Node owns the database and the taxonomies
node scripts/export_qualification.mjs --name "MicroCredit" --out mcas.json

# here: Python owns the ontology
.venv/bin/python -m airo_min.build mcas.json --extracted mcas.extracted.json \
    --format turtle --out mcas.ttl
```

Structured form fields (tags, pickers, risk rows) map deterministically. Two
properties live inside prose, `usesTechnique` in answer 2(a) and `hasComponent` in
2(c), and come from the `--extracted` file: that is the slot a filler agent's output
fills. Without it they are absent rather than invented.

The Annex IV answers are preserved verbatim as `qual:answer` annotations on the
AISystem, each with its Annex IV citation, in our own namespace. The AIRO structure
therefore stays at exactly 19 properties while the graph still carries 100% of the
technical documentation.

## Granularity: read the prompt first

`prompts/filling-the-airo-ontology.md` is the rule for how many nodes an answer
becomes. Short version: VAIR's term list sets the granularity, not the prose. VAIR names
17 techniques and 22 component kinds for every AI system that will ever exist, so one system
gets 1 to 3 techniques and one node per kind of part, never one per noun phrase in an
answer. Labels are names of at most 60 characters; the detail is already attached verbatim
as `qual:answer` with its Annex IV citation.

Without that rule, three independent agents each produced 6 `AITechnique` nodes for MCAS
from a vocabulary whose terms are closed, one of them "a fixed version-controlled system
prompt". The filler loads it as its system prompt before drafting an `extracted` file.

## The worked example: MCAS

`examples/` holds a real qualification end to end, rebuilt and checked by
`tests/test_example_mcas.py` on every run, with no database needed:

| file | what it is |
|---|---|
| `mcas.qualification.json` | the saved form, exported: 13 Annex IV answers, 5 risk rows, all pickers |
| `mcas.extracted.json` | the curated prose extraction (techniques, components) |
| `mcas.ttl` / `mcas.jsonld` | the filled AIRO graph, 295 triples |

MicroCredit Assist Score v1.2.0 is a consumer-credit scoring system, so Annex III
5(b) high-risk. Its graph instantiates 17 of the 19 classes (`Stakeholder` and
`RiskConcept` are abstract parents, never instantiated directly), uses all 19
properties, and asserts 10 VAIR terms.

Deliberately not here: the Annex III SHACL classifier from the AIRO repo (as shipped,
none of its 103 property shapes has `sh:minCount`, so every AISystem matches all 28
shapes), the 24 AIRO classes outside Figure 3, `AISubject`, and any HTTP service.
See `NOTICE` for licences.
