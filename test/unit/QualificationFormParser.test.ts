import { describe, it, expect } from "vitest";
import {
  QualificationFormParser,
  FormValidationError,
} from "@/server/forms/QualificationFormParser";
import type { TaxonomyService } from "@/domain/Taxonomy";
import { KEY_QUESTIONS, keyQuestionField } from "@/data/keyQuestions";

// Minimal taxonomy stub — only the methods the parser touches.
function fakeTaxonomy(
  overrides: Partial<TaxonomyService> = {},
): TaxonomyService {
  return {
    isValidTargetSystemTag: () => true,
    isValidSectorTag: () => true,
    validQuestionIds: () => new Set<string>(),
    ...overrides,
  } as unknown as TaxonomyService;
}

function validMetadata(): FormData {
  const fd = new FormData();
  fd.set("systemName", "Acme Vision");
  fd.set("systemVersion", "1.0");
  fd.set("company", "Acme");
  fd.set("description", "A vision system.");
  fd.set("targetUseCase", "Shelf scanning.");
  fd.set("targetUsers", "Store staff.");
  fd.set("intendedDeployers", "Supermarket chains operating the cameras.");
  return fd;
}

/** One risk row (question 15) with every required field filled. */
function addRisk(
  fd: FormData,
  i: number,
  over: Partial<Record<string, string>> = {},
) {
  const v = {
    risk: "Wrong out-of-stock alert",
    source: "Poor lighting or occlusion",
    consequence: "Staff sent to a full shelf",
    affected: "user",
    control: "Confidence threshold and human confirmation",
    ...over,
  };
  for (const [k, val] of Object.entries(v)) fd.set(`risk:${i}:${k}`, val);
  fd.append(`risk:${i}:area`, "safety");
}

/** Metadata + tags + AIRO pickers + every required Annex IV answer + one risk. */
function fullySubmittable(): FormData {
  const fd = validMetadata();
  fd.append("targetSystemTags", "computer-vision:object-detection");
  fd.append("sectorTags", "health");
  fd.append("marketFormTags", "software");
  fd.append("localityTags", "workplace");
  for (const q of KEY_QUESTIONS) {
    if (q.optional) continue;
    fd.set(keyQuestionField(q), `Answer for ${q.id}.`);
  }
  addRisk(fd, 0);
  return fd;
}

describe("QualificationFormParser", () => {
  it("rejects blank metadata with its field message", () => {
    const fd = validMetadata();
    fd.set("systemName", "");
    const parser = new QualificationFormParser(fakeTaxonomy());
    expect(() => parser.parse(fd)).toThrow(FormValidationError);
    expect(() => parser.parse(fd)).toThrow(/System name is required/);
  });

  it("requires at least one target-system tag", () => {
    const fd = validMetadata();
    fd.append("sectorTags", "retail");
    const parser = new QualificationFormParser(fakeTaxonomy());
    expect(() => parser.parse(fd)).toThrow(/at least one target-system/);
  });

  it("requires at least one sector tag", () => {
    const fd = validMetadata();
    fd.append("targetSystemTags", "vision:detection");
    const parser = new QualificationFormParser(fakeTaxonomy());
    expect(() => parser.parse(fd)).toThrow(/at least one sector/i);
  });

  it("rejects an unknown target-system tag", () => {
    const fd = validMetadata();
    fd.append("targetSystemTags", "bogus");
    fd.append("sectorTags", "retail");
    const parser = new QualificationFormParser(
      fakeTaxonomy({ isValidTargetSystemTag: () => false }),
    );
    expect(() => parser.parse(fd)).toThrow(/Unknown target system tag: bogus/);
  });

  it("accepts a submission that leaves every 'where applicable' question blank", () => {
    const parser = new QualificationFormParser(fakeTaxonomy());
    const parsed = parser.parse(fullySubmittable());
    const answered = parsed.answers.map((a) => `${a.toolId}:${a.questionId}`);
    expect(answered).toHaveLength(10);
    expect(answered).toContain("annex-1:1a");
    expect(answered).toContain("annex-2:2h");
    expect(answered).not.toContain("annex-1:1b");
  });

  it("stores an optional answer when the deployer does provide one", () => {
    const fd = fullySubmittable();
    fd.set("q:annex-2:2d", "Two labelled sets, both scraped in-house.");
    const parser = new QualificationFormParser(fakeTaxonomy());
    const parsed = parser.parse(fd);
    expect(parsed.answers).toHaveLength(11);
    expect(parsed.answers.find((a) => a.questionId === "2d")?.answer).toBe(
      "Two labelled sets, both scraped in-house.",
    );
  });

  it("rejects a submission missing a required Annex IV answer", () => {
    const fd = fullySubmittable();
    fd.set("q:annex-2:2g", "   ");
    const parser = new QualificationFormParser(fakeTaxonomy());
    expect(() => parser.parse(fd)).toThrow(FormValidationError);
    expect(() => parser.parse(fd)).toThrow(/1 missing/);
  });

  it("ignores answers submitted under retired question ids", () => {
    const fd = fullySubmittable();
    fd.set("q:data:data-source", "Left over from the old form.");
    const parser = new QualificationFormParser(fakeTaxonomy());
    const parsed = parser.parse(fd);
    expect(parsed.answers).toHaveLength(10);
    expect(parsed.answers.some((a) => a.toolId === "data")).toBe(false);
  });

  // ── AIRO-aligned metadata (market form, locality, intended deployers) ────

  it("requires intended deployers", () => {
    const fd = fullySubmittable();
    fd.set("intendedDeployers", "  ");
    const parser = new QualificationFormParser(fakeTaxonomy());
    expect(() => parser.parse(fd)).toThrow(/Intended deployers are required/);
  });

  it("requires at least one market form and one locality", () => {
    const parser = new QualificationFormParser(fakeTaxonomy());
    const noForm = fullySubmittable();
    noForm.delete("marketFormTags");
    expect(() => parser.parse(noForm)).toThrow(/at least one market form/i);
    const noLoc = fullySubmittable();
    noLoc.delete("localityTags");
    expect(() => parser.parse(noLoc)).toThrow(/at least one locality/i);
  });

  it("rejects ids outside the AIRO vocabularies", () => {
    const parser = new QualificationFormParser(fakeTaxonomy());
    const fd = fullySubmittable();
    fd.append("marketFormTags", "hologram");
    expect(() => parser.parse(fd)).toThrow(/Unknown market form: hologram/);
    const fd2 = fullySubmittable();
    fd2.append("localityTags", "moon");
    expect(() => parser.parse(fd2)).toThrow(/Unknown locality: moon/);
  });

  it("returns the new metadata on the parsed result", () => {
    const parser = new QualificationFormParser(fakeTaxonomy());
    const parsed = parser.parse(fullySubmittable());
    expect(parsed.marketFormTags).toEqual(["software"]);
    expect(parsed.localityTags).toEqual(["workplace"]);
    expect(parsed.intendedDeployers).toBe(
      "Supermarket chains operating the cameras.",
    );
  });

  // ── Risk block (question 15) ─────────────────────────────────────────────

  it("requires at least one risk row", () => {
    const fd = fullySubmittable();
    for (const k of [...fd.keys()]) if (k.startsWith("risk:")) fd.delete(k);
    const parser = new QualificationFormParser(fakeTaxonomy());
    expect(() => parser.parse(fd)).toThrow(/at least one risk/i);
  });

  it("parses two rows in order with optional fields as null", () => {
    const fd = fullySubmittable();
    addRisk(fd, 1, {
      risk: "Data poisoning",
      vulnerability: "Unsigned training pipeline",
      followUpControl: "Roll back to previous model",
    });
    const parser = new QualificationFormParser(fakeTaxonomy());
    const { risks } = parser.parse(fd);
    expect(risks).toHaveLength(2);
    expect(risks[0]).toMatchObject({
      position: 0,
      risk: "Wrong out-of-stock alert",
      vulnerability: null,
      followUpControl: null,
      affected: "user",
      impactAreas: ["safety"],
    });
    expect(risks[1]).toMatchObject({
      position: 1,
      risk: "Data poisoning",
      vulnerability: "Unsigned training pipeline",
      followUpControl: "Roll back to previous model",
    });
  });

  it("skips a completely empty trailing row", () => {
    const fd = fullySubmittable();
    for (const k of ["risk", "source", "consequence", "control"])
      fd.set(`risk:1:${k}`, "");
    const parser = new QualificationFormParser(fakeTaxonomy());
    expect(parser.parse(fd).risks).toHaveLength(1);
  });

  it("rejects a row missing a required field, naming the row and field", () => {
    const fd = fullySubmittable();
    fd.set("risk:0:consequence", "  ");
    const parser = new QualificationFormParser(fakeTaxonomy());
    expect(() => parser.parse(fd)).toThrow(
      /Risk 1: What happens as a result is required/,
    );
  });

  it("rejects an affected value outside operator/user", () => {
    const fd = fullySubmittable();
    fd.set("risk:0:affected", "subject");
    const parser = new QualificationFormParser(fakeTaxonomy());
    expect(() => parser.parse(fd)).toThrow(
      /Risk 1: who is affected must be operator or user/,
    );
  });

  it("requires at least one known area of impact per row", () => {
    const parser = new QualificationFormParser(fakeTaxonomy());
    const none = fullySubmittable();
    none.delete("risk:0:area");
    expect(() => parser.parse(none)).toThrow(
      /Risk 1: pick at least one area of impact/,
    );
    const bad = fullySubmittable();
    bad.append("risk:0:area", "economy");
    expect(() => parser.parse(bad)).toThrow(
      /Risk 1: unknown area of impact: economy/,
    );
  });
});
