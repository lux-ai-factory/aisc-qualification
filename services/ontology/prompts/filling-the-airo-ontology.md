---
title: Filling the AIRO ontology
purpose: The system prompt for drafting AIRO nodes from a qualification's answers
---

# Filling the AIRO ontology

## Overview

**The vocabulary sets the granularity, not the prose.**

AIRO's companion vocabulary VAIR already decides which kinds of thing each property
admits, and the list is closed. VAIR names 17 techniques and 22 component kinds for every
AI system that will ever exist, so a system gets one node per *applicable term*, never one
per noun phrase in the answer. Read the term list first, pick the terms that apply, then
create one node each.

The test for a node is not "is this mentioned" but "does a term name it". Six nouns in an
answer that all land on `vair:MachineLearningModel` are one node.

A node is a **named thing** other statements point at. If you cannot name it in a short
noun phrase, it is not a node: it is a sentence, and sentences belong in the answer
annotation that already travels with the graph.

## The contract

For every node you create, produce all three parts:

1. **A VAIR type**, chosen from the closed list for that property. No applicable term
   means no node, or a node with no VAIR type flagged for a reviewer.
2. **A label that is a name**: a noun phrase, at most 60 characters. Not a clause.
3. **Nothing else.** The detail is already in the verbatim answer annotation
   (`qual:answer` with its Annex IV citation). Never restate it in a label.

## The term lists

Run this rather than guessing; it is the authority:

```bash
.venv/bin/python -c "
from rdflib import Graph, RDF, RDFS, URIRef
g=Graph().parse('airo/vair.ttl', format='turtle')
A='https://w3id.org/airo#'; V='https://w3id.org/vair#'
c=URIRef(A+'AITechnique')   # <- the class you are filling
print(sorted({str(s).replace(V,'') for s,_,_ in g.triples((None,RDFS.subClassOf,c))} |
             {str(s).replace(V,'') for s,_,_ in g.triples((None,RDF.type,c))}))"
```

| Property | Class | VAIR terms | So one system gets |
|---|---|---|---|
| `usesTechnique` | AITechnique | 17 | 1 to 3 |
| `hasComponent` | AIComponent | 22 | one per *kind* of part, not per service |
| `hasModality` | Modality | 4 | from the form picker |
| `isUsedWithinLocality` | LocalityOfUse | 3 | from the form picker |
| `hasImpactOnArea` | AreaOfImpact | 7 | from the form picker |
| `isRiskSourceFor` | RiskSource | 44 | one per risk row |
| `hasConsequence` | Consequence | 7 | one per risk row |
| `hasImpact` | Impact | 9 | one per risk row |
| `modifiesRiskConcept` | RiskControl | 20 | one per control named |
| `isAppliedWithinDomain` | Domain | 11 | from the sector tags |
| `hasCapability` | AICapability | 35 | from the capability tags |
| `hasPurpose` | Purpose | 122 | 1 to 2 |

The counts are transitive: VAIR nests, so `vair:DecisionTree` counts under AIComponent
through `vair:Model`, and `vair:Police` under AIOperator through
`vair:EmergencyServiceProvider`. Ask the service for the list
(`GET /vocabularies`) rather than reading vair.ttl yourself, and never invent a term: the
builder refuses any name that is not defined *for that node's class*, which includes the
101 names VAIR leaves attached to no class at all.

`usesTechnique` and `hasComponent` are the two properties fed from prose, so they are the
two that inflate. A long list of terms is not permission to use many: an answer that says
"gradient-boosted decision tree" is one technique and one component, not six.

## Worked example: MCAS techniques, from Annex IV 2(a)

The answer names feature engineering, a gradient-boosted decision tree, a hosted LLM used
as-is, a retrieval index, a version-controlled system prompt, and hand-written policy rules.

**Wrong, 6 nodes, one per noun phrase.** Three independent agents produced exactly this:

```json
{"techniques": [
  "Feature engineering on bureau, transaction and application data",
  "Gradient-boosted decision tree trained on historical loan outcomes",
  "Hosted third-party large language model used as-is without fine-tuning",
  "Retrieval-augmented generation over internal policy documentation",
  "Fixed version-controlled system prompt",
  "Hand-written rule-based policy logic"
]}
```

Six nodes where the vocabulary offers five kinds. A system prompt is a configuration
artefact, not an AI technique. Every label is a clause. The detail duplicates the answer.

**Right, 3 nodes, one per applicable VAIR term:**

```json
{"techniques": [
  {"label": "Gradient-boosted decision tree", "vair": "MachineLearning"},
  {"label": "Policy eligibility rules",       "vair": "LogicBasedTechnique"},
  {"label": "Policy-document retrieval",      "vair": "KnowledgeBasedTechnique"}
]}
```

The LLM and the GBDT are both MachineLearning, so they are one node unless something
else in the graph must point at them separately. Feature engineering and the system
prompt are how the techniques were applied: that is 2(a)'s prose, already preserved.

## Worked example: MCAS components, from Annex IV 2(c)

The answer lists five microservices. Component kinds, not services:

```json
{"components": [
  {"label": "Scoring model",          "vair": "Model"},
  {"label": "Policy-rule engine",     "vair": "Algorithm"},
  {"label": "Hosted LLM",             "vair": "Tool"},
  {"label": "On-premise service tier","vair": "ApplicationPlatform"}
]}
```

The ingest service, explanation service and audit service are all one
ApplicationPlatform: naming them separately adds three nodes that nothing points at and
that no reviewer would query.

## Labels: the 60-character test

Take the label from the answer's own noun phrase, not its sentence.

| Class | Wrong | Right |
|---|---|---|
| Purpose | the entire 514-character use-case answer | `Creditworthiness assessment for consumer loans` |
| AIUser | 307 characters listing every role | `Bank customers and loan officers` |
| AIOperator | 455-character deployer paragraph | `Retail banks in DE, FR and NL` |
| RiskControl | 245 characters describing the whole procedure | `Mandatory officer review of every Reject` |
| Risk | a full sentence from the form | `Applicant wrongly ranked high risk` |

Supply the names in the `extracted` file's `names` map, keyed by node local name
(`purpose`, `users`, `deployer`, `risk0`, `risk0_control`, ...). The builder falls back to
truncating at a word boundary with a trailing `...`, which meets the length rule but is
not a name: a trailing ellipsis anywhere in a finished graph means a name is missing.

If the source is a form field you cannot shorten without losing meaning, keep the short
label on the node and attach the full text as `qual:fullLabel` on that node (`qual:text` means the Annex IV answer). The node stays
nameable; nothing is lost.

## How big should the graph be

Count before you build. Each risk row is 6 or 7 nodes, because Figure 3 models Risk,
RiskSource, Vulnerability, Consequence, Impact and RiskControl separately.

```
system half   1 system + capabilities + 1 domain + modalities
              + localities + 1 purpose + 2 operators + 1 user
              + techniques (<=3) + component kinds (<=4)     ~ 20
risk half     risk rows x 7                                  ~ 7n
```

MCAS with 5 risks: about 55 nodes. If that is too many, the lever is the number of risk
rows or the number of capability tags, never a shorter schema: the schema is already the
19-class minimum.

## Common mistakes

| Mistake | Fix |
|---|---|
| One node per noun phrase in the answer | One node per applicable VAIR term |
| A label that is a clause or a sentence | Noun phrase, 60 characters, prose stays in the annotation |
| Inventing a VAIR term that is not in the list | Run the query above; no term means no node, or flag it |
| Trusting a term you remember | `vair:API` looks real and is listed under AIComponent, but VAIR 1.0 declares it with the empty prefix so its IRI is `http://www.semanticweb.org/owl/owlapi/turtle#API`, not a `vair:` term at all. The builder refuses it. Use `Tool`. |
| A node for the same concept in two risks | Share it, as stakeholders and areas already are |
| Two nodes for one thing in two roles | Pick the role something else points at |
| Restating the answer on the node | The answer is already attached verbatim with its citation |

## Verify

```bash
.venv/bin/pytest                        # schema, vocab, build, MCAS example
.venv/bin/python -m airo_min.build examples/mcas.qualification.json \
    --extracted examples/mcas.extracted.json --out /tmp/g.ttl
```

The builder refuses any class or property outside the 19, and `validate()` reports any
node whose type or range is wrong. A graph that validates can still be too granular:
that is what this prompt is for.
