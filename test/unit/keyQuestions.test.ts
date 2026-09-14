import { describe, it, expect } from "vitest";
import {
  KEY_QUESTIONS,
  KEY_QUESTION_GROUPS,
  keyQuestionField,
  keyQuestionIdSet,
  resolveKeyQuestion,
  isKeyQuestion,
} from "@/data/keyQuestions";

// The question set is derived from EU AI Act Annex IV points 1 and 2. Its 16
// lettered sub-items compress to 14 questions: 1(d)+1(e) and 1(g)+1(h) merge
// (the Annex repeats the deployer-UI wording verbatim under (h)), and 1(a)
// drops the parts already captured by the form's metadata fields.
const ANNEX_1_IDS = ["1a", "1b", "1c", "1de", "1f", "1gh"];
const ANNEX_2_IDS = ["2a", "2b", "2c", "2d", "2e", "2f", "2g", "2h"];

// The sub-items the Annex itself qualifies with "where applicable" or
// "where relevant".
const OPTIONAL_IDS = ["1b", "1f", "2d", "2f"];

describe("KEY_QUESTIONS", () => {
  it("holds 14 questions, every one under an Annex IV point", () => {
    expect(KEY_QUESTIONS).toHaveLength(14);
    const strays = KEY_QUESTIONS.filter(
      (q) => q.group !== "annex-1" && q.group !== "annex-2",
    ).map((q) => q.id);
    expect(strays).toEqual([]);
  });

  it("covers the annex-1 sub-items in Annex IV order", () => {
    const ids = KEY_QUESTIONS.filter((q) => q.group === "annex-1").map(
      (q) => q.id,
    );
    expect(ids).toEqual(ANNEX_1_IDS);
  });

  it("covers the annex-2 sub-items in Annex IV order", () => {
    const ids = KEY_QUESTIONS.filter((q) => q.group === "annex-2").map(
      (q) => q.id,
    );
    expect(ids).toEqual(ANNEX_2_IDS);
  });

  it("marks exactly the 'where applicable' sub-items optional", () => {
    const optional = KEY_QUESTIONS.filter((q) => q.optional).map((q) => q.id);
    expect(optional).toEqual(OPTIONAL_IDS);
  });

  it("gives every question a traceable Annex IV citation", () => {
    for (const q of KEY_QUESTIONS) {
      expect(q.citation, `citation for ${q.id}`).toMatch(
        /^Annex IV\([12]\)\([a-h]\)(-\([a-h]\))?$/,
      );
    }
  });

  it("cites the merged sub-items as letter ranges", () => {
    expect(resolveKeyQuestion("annex-1", "1de")?.citation).toBe(
      "Annex IV(1)(d)-(e)",
    );
    expect(resolveKeyQuestion("annex-1", "1gh")?.citation).toBe(
      "Annex IV(1)(g)-(h)",
    );
  });

  it("asks every question as non-empty prose", () => {
    for (const q of KEY_QUESTIONS) {
      expect(q.text.length, `text for ${q.id}`).toBeGreaterThan(20);
    }
  });

  // A question has to be answerable by a company that does not have the AI Act
  // open beside it. The Annex IV citation lives in `citation`, where an auditor
  // can find it; the question text itself must stand alone.
  it("asks every question without cross-referencing the AI Act", () => {
    for (const q of KEY_QUESTIONS) {
      expect(q.text, `text for ${q.id}`).not.toMatch(
        /\b(Article|Chapter|Section|Annex|Regulation|point \()\b/i,
      );
    }
  });

  it("asks every question in plain language, not the Annex's register", () => {
    const JARGON = [
      "placed on the market",
      "put into service",
      "provenance",
      "pre-determined",
      "discriminatory",
      "deployer",
      "conformity",
      "harmonised",
      "intended purpose",
    ];
    for (const q of KEY_QUESTIONS) {
      for (const term of JARGON) {
        expect(
          q.text.toLowerCase(),
          `${term} in text for ${q.id}`,
        ).not.toContain(term);
      }
    }
  });

  // Plain is not the same as chatty. These questions go into a compliance
  // document, so the register is plain professional English: no legalese
  // (above), and no colloquialism either.
  it("asks every question in a professional register", () => {
    const COLLOQUIAL = [
      "just say so",
      "say so",
      "keep an eye on",
      "cleaned it up",
      "clean it up",
      "ready-made",
      "outside tools",
      "someone else's",
      "customers get",
      "hand work",
      "sort of",
      "a bit",
    ];
    for (const q of KEY_QUESTIONS) {
      for (const term of COLLOQUIAL) {
        expect(
          q.text.toLowerCase(),
          `"${term}" in text for ${q.id}`,
        ).not.toContain(term);
      }
    }
  });

  // Every company has a first release, so 1(a) must not presuppose that an
  // earlier version exists.
  it("lets a first release answer the version-lineage question", () => {
    const q = resolveKeyQuestion("annex-1", "1a");
    expect(q?.text).toMatch(/first release/i);
  });
});

describe("KEY_QUESTION_GROUPS", () => {
  it("derives the two Annex IV points, in order, with their labels", () => {
    expect(KEY_QUESTION_GROUPS).toEqual([
      { id: "annex-1", label: "About the system" },
      { id: "annex-2", label: "How the system was built" },
    ]);
  });
});

describe("field naming and lookup", () => {
  it("names a form field q:<group>:<id>", () => {
    const q = KEY_QUESTIONS[0];
    expect(keyQuestionField(q)).toBe("q:annex-1:1a");
  });

  it("builds the composite id set the parser validates against", () => {
    const set = keyQuestionIdSet();
    expect(set.size).toBe(14);
    expect(set.has("annex-1:1de")).toBe(true);
    expect(set.has("annex-2:2h")).toBe(true);
    // Ids from the retired plain-language question set must no longer resolve.
    expect(set.has("data:data-source")).toBe(false);
  });

  it("resolves a known question and rejects a retired one", () => {
    expect(isKeyQuestion("annex-2", "2b")).toBe(true);
    expect(isKeyQuestion("risk", "key-risks")).toBe(false);
    expect(resolveKeyQuestion("risk", "key-risks")).toBeNull();
  });
});
