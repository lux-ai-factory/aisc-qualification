import { describe, it, expect } from "vitest";
import { aiCardExport, type CardFacts } from "@/domain/SystemCard";
import type { OntologyBuild } from "@/server/services/OntologyClient";
import type { OntologyView } from "@/domain/OntologyView";

const facts: CardFacts = {
  id: "abc",
  systemName: "MicroCredit Assist Score (MCAS)",
  systemVersion: "v1.2.0",
  company: "Creditum AI SARL",
  description: "Scores consumer loan applications.",
  targetUseCase: "Pre-screening consumer loans.",
  targetUsers: "Loan officers; applicants.",
  targetSystemTags: ["predictive-analytical-ai:risk-scoring-assessment"],
  sectorTags: ["economy"],
};

const node = (id: string, label: string, cls: string) => ({
  id,
  label,
  cls,
  vair: null,
  fullText: null,
  provenance: "form" as const,
});

const view = {
  system: node("system", "MicroCredit Assist Score (MCAS) v1.2.0", "AISystem"),
  answers: [
    { citation: "Annex IV(1)(a)", questionId: "annex-1a", text: "v1.2.0 follows v1.1.x." },
  ],
  rows: [
    {
      property: "hasPurpose",
      label: "Purpose",
      citation: "Art 3(12); Annex IV 1(a)",
      nodes: [node("purpose", "Creditworthiness assessment", "AIPurpose")],
    },
  ],
  chains: [
    {
      citation: "Art 9(2); Annex IV 5",
      risk: node("risk2", "Officers rubber-stamp the recommendation", "Risk"),
      source: node("risk2_source", "Automation bias", "RiskSource"),
      vulnerability: null,
      consequence: null,
      impact: null,
      stakeholder: null,
      areas: [],
      control: node("risk2_control", "Override rates tracked", "RiskControl"),
      followUp: null,
    },
  ],
  counts: {
    nodes: 59,
    triples: 406,
    risks: 5,
    reviewed: 0,
    untyped: 12,
    needsTerm: 0,
    flagged: 0,
    unclassifiable: 12,
  },
} as unknown as OntologyView;

const build: OntologyBuild = {
  view,
  jsonld: JSON.stringify({ "@graph": [{ "@id": "ex:system" }] }),
  turtle: "@prefix ex: <http://example.org/> .",
  problems: ["risk3 has no consequence"],
  digest: "0".repeat(64),
};

describe("the AI card as JSON", () => {
  it("carries everything the PDF is rendered from", () => {
    const exported = aiCardExport(facts, build);
    // the same payload the renderer gets, so the two cards cannot disagree
    expect(exported.system_name).toBe("MicroCredit Assist Score (MCAS)");
    expect(exported.qualification_id).toBe("abc");
    expect(exported.classification).toBeTruthy();
    expect(exported.ontology).toEqual(view);
  });

  it("keeps the AI Act citations, which live only in the view", () => {
    // build_view computes them from the schema; the graph does not hold them,
    // so a JSON of the graph alone loses them.
    const exported = aiCardExport(facts, build);
    const ontology = exported.ontology as OntologyView;
    expect(ontology.rows[0].citation).toBe("Art 3(12); Annex IV 1(a)");
    expect(ontology.chains[0].citation).toBe("Art 9(2); Annex IV 5");
  });

  it("keeps the risk chains whole", () => {
    const ontology = aiCardExport(facts, build).ontology as OntologyView;
    expect(ontology.chains).toHaveLength(1);
    expect(ontology.chains[0].risk.label).toBe(
      "Officers rubber-stamp the recommendation",
    );
    expect(ontology.chains[0].control?.label).toBe("Override rates tracked");
  });

  it("keeps the Annex IV answers verbatim", () => {
    const ontology = aiCardExport(facts, build).ontology as OntologyView;
    expect(ontology.answers[0].text).toBe("v1.2.0 follows v1.1.x.");
  });

  it("embeds the graph itself, so nothing is lost to the projection", () => {
    // The view is a projection: it shows what a card needs. The graph is the
    // source, and a consumer that wants a node the view omits must have it.
    const exported = aiCardExport(facts, build);
    expect(exported.ontology_graph).toEqual({ "@graph": [{ "@id": "ex:system" }] });
  });

  it("reports what the build could not settle", () => {
    expect(aiCardExport(facts, build).ontology_problems).toEqual([
      "risk3 has no consequence",
    ]);
  });

  it("is JSON-serialisable as it stands", () => {
    const round = JSON.parse(JSON.stringify(aiCardExport(facts, build)));
    expect((round.ontology as OntologyView).counts.risks).toBe(5);
  });

  it("survives a graph that is not valid JSON rather than losing the card", () => {
    // The graph arrives as a string from the ontology service; if it is ever
    // unparseable the card is still worth exporting.
    const exported = aiCardExport(facts, { ...build, jsonld: "not json" });
    expect(exported.ontology).toEqual(view);
    expect(exported.ontology_graph).toBeNull();
  });
});
