import { describe, it, expect } from "vitest";
import { METADATA_FIELDS } from "@/data/formFields";
import { RISK_BLOCK, RISK_FIELDS } from "@/data/riskFields";

const CITATION = /^(Art \d|Annex [IVX]+)/;

describe("form citations", () => {
  it("every metadata field carries an AI Act citation", () => {
    const ids = Object.keys(METADATA_FIELDS);
    expect(ids).toEqual(
      expect.arrayContaining([
        "systemName",
        "systemVersion",
        "company",
        "description",
        "targetUseCase",
        "targetUsers",
        "intendedDeployers",
        "targetSystemTags",
        "sectorTags",
        "marketFormTags",
        "localityTags",
      ]),
    );
    for (const [id, f] of Object.entries(METADATA_FIELDS)) {
      expect(f.citation, id).toMatch(CITATION);
      expect(f.label.length, id).toBeGreaterThan(2);
    }
  });

  it("the risk block and each of its eight fields carry citations", () => {
    expect(RISK_BLOCK.citation).toMatch(CITATION);
    expect(RISK_FIELDS.map((f) => f.id)).toEqual([
      "risk",
      "source",
      "vulnerability",
      "consequence",
      "affected",
      "area",
      "control",
      "followUpControl",
    ]);
    for (const f of RISK_FIELDS) expect(f.citation, f.id).toMatch(CITATION);
    expect(RISK_FIELDS.filter((f) => f.optional).map((f) => f.id)).toEqual([
      "vulnerability",
      "followUpControl",
    ]);
    expect(RISK_FIELDS.find((f) => f.id === "affected")?.kind).toBe("affected");
    expect(RISK_FIELDS.find((f) => f.id === "area")?.kind).toBe("areas");
  });

  it("uses plain professional wording, no cross-references inside labels", () => {
    for (const f of RISK_FIELDS)
      expect(f.label).not.toMatch(/Article|Annex|Chapter/);
    for (const f of Object.values(METADATA_FIELDS))
      expect(f.label).not.toMatch(/Article|Annex|Chapter/);
  });
});
