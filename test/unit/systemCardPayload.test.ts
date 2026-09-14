import { describe, it, expect } from "vitest";
import {
  cardFileName,
  systemCardPayload,
  type CardFacts,
} from "@/domain/SystemCard";

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

const ontology = { system: { id: "system", label: "MCAS" }, rows: [], chains: [] };

describe("the payload the renderer is sent", () => {
  it("is a complete card from the form alone, with no generated prose", () => {
    const payload = systemCardPayload(facts, null, ontology);
    // every field the renderer requires
    expect(payload.system_name).toBe("MicroCredit Assist Score (MCAS)");
    expect(payload.system_version).toBe("v1.2.0");
    expect(payload.provider).toBe("Creditum AI SARL");
    expect(payload.description).toBe("Scores consumer loan applications.");
    expect(payload.target_use_case).toBe("Pre-screening consumer loans.");
    expect(payload.target_users).toBe("Loan officers; applicants.");
    expect(payload.qualification_id).toBe("abc");
  });

  it("resolves the tags to names, since a PDF reader cannot read ids", () => {
    const payload = systemCardPayload(facts, null, null);
    expect(payload.classification).toEqual({
      target_systems: [
        {
          category: "Predictive & Analytical AI",
          subcategory: "Risk Scoring & Assessment",
        },
      ],
      sectors: ["Economy"],
    });
  });

  it("carries the filled graph", () => {
    const payload = systemCardPayload(facts, null, ontology);
    expect(payload.ontology).toBe(ontology);
  });

  it("leaves the graph out when it could not be built", () => {
    const payload = systemCardPayload(facts, null, null);
    expect("ontology" in payload).toBe(false);
  });

  it("merges the written prose when someone generated it", () => {
    const payload = systemCardPayload(
      facts,
      {
        overview: "MCAS scores short-term loan applications.",
        findings: [{ title: "Data governance", summary: "Applicant data only.", points: [] }],
        open_issues: ["No post-market monitoring plan yet."],
      },
      ontology,
    );
    expect(payload.overview).toBe("MCAS scores short-term loan applications.");
    expect((payload.findings as unknown[]).length).toBe(1);
    expect(payload.open_issues).toEqual(["No post-market monitoring plan yet."]);
    // the prose never replaces the graph
    expect(payload.ontology).toBe(ontology);
  });

  it("keeps the form's own facts even when a stale generated card disagrees", () => {
    const payload = systemCardPayload(
      facts,
      { system_version: "v0.9.0", overview: "old" } as Record<string, unknown>,
      null,
    );
    expect(payload.system_version).toBe("v1.2.0");
  });
});

describe("the download filename", () => {
  it("carries the version once, whether or not the provider typed the v", () => {
    expect(cardFileName(facts, "ontology.jsonld")).toBe(
      "microcredit_assist_score_mcas_v1.2.0_ontology.jsonld",
    );
    expect(cardFileName({ ...facts, systemVersion: "2.0" }, "ai_card.pdf")).toBe(
      "microcredit_assist_score_mcas_v2.0_ai_card.pdf",
    );
  });
});
