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
  targetSystemTags: ["Profiling"],
  sectorTags: ["PrivateService"],
};

const ontology = {
  system: { id: "system", label: "MCAS" },
  rows: [],
  chains: [],
};

describe("the payload the renderer is sent", () => {
  it("is a complete card from the form alone, with no generated prose", () => {
    const payload = systemCardPayload(facts, ontology);
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
    const payload = systemCardPayload(facts, null);
    // VAIR terms: a capability is flat, so it has no category
    expect(payload.classification).toEqual({
      target_systems: [{ subcategory: "Profiling" }],
      sectors: ["Private Service"],
    });
  });

  it("carries the filled graph", () => {
    const payload = systemCardPayload(facts, ontology);
    expect(payload.ontology).toBe(ontology);
  });

  it("leaves the graph out when it could not be built", () => {
    const payload = systemCardPayload(facts, null);
    expect("ontology" in payload).toBe(false);
  });
});

describe("the download filename", () => {
  it("carries the version once, whether or not the provider typed the v", () => {
    expect(cardFileName(facts, "ontology.jsonld")).toBe(
      "microcredit_assist_score_mcas_v1.2.0_ontology.jsonld",
    );
    expect(
      cardFileName({ ...facts, systemVersion: "2.0" }, "ai_card.pdf"),
    ).toBe("microcredit_assist_score_mcas_v2.0_ai_card.pdf");
  });

  it("fits a Content-Disposition header whatever the version holds", () => {
    for (const systemVersion of ["2.0 – beta", "1.0 β", '1.0 "rc"', "1.0\\x"]) {
      const name = cardFileName({ ...facts, systemVersion }, "ai_card.pdf");
      expect(name, systemVersion).toMatch(/^[a-z0-9._-]+$/i);
      expect(
        () =>
          new Headers({
            "Content-Disposition": `attachment; filename="${name}"`,
          }),
        systemVersion,
      ).not.toThrow();
    }
    expect(
      cardFileName({ ...facts, systemVersion: "2.0 – beta" }, "ai_card.pdf"),
    ).toBe("microcredit_assist_score_mcas_v2.0_beta_ai_card.pdf");
  });
});
