import { describe, it, expect } from "vitest";
import { toExport } from "@/server/services/QualificationExporter";
import type { QualificationWithAnswers } from "@/server/repositories/QualificationRepository";

function row(over: Partial<QualificationWithAnswers> = {}) {
  return {
    id: "q1",
    systemName: "MCAS",
    systemVersion: "v1.2.0",
    company: "Creditum AI SARL",
    description: "Credit scoring.",
    targetUseCase: "Creditworthiness.",
    targetUsers: "Officers.",
    intendedDeployers: "Banks.",
    targetSystemTags: [
      "natural-language-processing:question-answering",
      "bogus:tag",
    ],
    sectorTags: ["finance-and-insurance", "not-a-sector"],
    marketFormTags: ["software"],
    localityTags: ["workplace"],
    systemCard: null,
    systemCardJson: null,
    ontologyExtracted: null,
    ontologyPatch: null,
    ontologyAt: null,
    systemCardAt: null,
    systemCardPdfPath: null,
    createdAt: new Date("2026-09-10"),
    updatedAt: new Date("2026-09-10"),
    answers: [
      {
        id: "a2",
        qualificationId: "q1",
        toolId: "annex-2",
        questionId: "2d",
        answer: "Data.",
      },
      {
        id: "a1",
        qualificationId: "q1",
        toolId: "annex-1",
        questionId: "1a",
        answer: "First.",
      },
    ],
    risks: [
      {
        id: "r1",
        qualificationId: "q1",
        position: 0,
        risk: "R",
        source: "S",
        vulnerability: null,
        consequence: "C",
        affected: "user",
        impactAreas: ["right"],
        control: "K",
        followUpControl: null,
      },
    ],
    ...over,
  } as unknown as QualificationWithAnswers;
}

describe("toExport", () => {
  it("resolves capability tags to their category and subcategory names", () => {
    const out = toExport(row());
    expect(out.targetSystems).toEqual([
      {
        tag: "natural-language-processing:question-answering",
        category: "Natural Language Processing",
        subcategory: "Question Answering",
      },
    ]);
  });

  it("resolves sector ids to their names", () => {
    expect(toExport(row()).sectors).toEqual([
      { id: "finance-and-insurance", name: "Finance and insurance" },
    ]);
  });

  it("drops tags that do not resolve rather than passing them through", () => {
    const out = toExport(row());
    expect(out.targetSystems).toHaveLength(1);
    expect(out.sectors).toHaveLength(1);
  });

  it("orders answers by question id so the graph is stable", () => {
    expect(toExport(row()).answers.map((a) => a.questionId)).toEqual([
      "1a",
      "2d",
    ]);
  });

  it("carries the pickers, the deployers and the risk rows through", () => {
    const out = toExport(row());
    expect(out.marketFormTags).toEqual(["software"]);
    expect(out.localityTags).toEqual(["workplace"]);
    expect(out.intendedDeployers).toBe("Banks.");
    expect(out.risks[0]).toMatchObject({
      position: 0,
      affected: "user",
      impactAreas: ["right"],
    });
  });

  it("produces only the fields the service needs, and no Date objects", () => {
    const out = toExport(row());
    expect(Object.keys(out).sort()).toEqual(
      [
        "answers",
        "company",
        "description",
        "id",
        "intendedDeployers",
        "localityTags",
        "marketFormTags",
        "risks",
        "sectors",
        "systemName",
        "systemVersion",
        "targetSystems",
        "targetUseCase",
        "targetUsers",
      ].sort(),
    );
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});
