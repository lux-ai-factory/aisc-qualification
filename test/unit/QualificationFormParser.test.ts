import { describe, it, expect } from "vitest";
import {
  QualificationFormParser,
  FormValidationError,
} from "@/server/forms/QualificationFormParser";
import { KEY_QUESTIONS, keyQuestionField } from "@/data/keyQuestions";

// The form speaks VAIR: the tags are checked against VAIR's terms, not an injected taxonomy,
// so the parser takes no arguments.

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
    // the VAIR selects that are required
    sourceTerm: "ErroneousInputData",
    impactTerm: "Harm",
    controlTerm: "HumanOversightMeasure",
    ...over,
  };
  for (const [k, val] of Object.entries(v)) fd.set(`risk:${i}:${k}`, val);
  fd.append(`risk:${i}:area`, "Safety");
}

/** Metadata + tags + AIRO pickers + every required Annex IV answer + one risk. */
function fullySubmittable(): FormData {
  const fd = validMetadata();
  fd.append("targetSystemTags", "ObjectRecognition");
  fd.append("sectorTags", "Employment");
  fd.append("marketFormTags", "Software");
  fd.append("localityTags", "Workplace");
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
    const parser = new QualificationFormParser();
    expect(() => parser.parse(fd)).toThrow(FormValidationError);
    expect(() => parser.parse(fd)).toThrow(/System name is required/);
  });

  it("lets capabilities and sectors be left empty: VAIR's lists do not cover every system", () => {
    const fd = fullySubmittable();
    fd.delete("targetSystemTags");
    fd.delete("sectorTags");
    const parsed = new QualificationFormParser().parse(fd);
    expect([parsed.targetSystemTags, parsed.sectorTags]).toEqual([[], []]);
  });

  it("rejects a capability or a sector that is not a VAIR term of its class", () => {
    const parser = new QualificationFormParser();
    const cap = fullySubmittable();
    cap.append("targetSystemTags", "bogus");
    expect(() => parser.parse(cap)).toThrow(/Unknown capability: bogus/);
    const sector = fullySubmittable();
    sector.append("sectorTags", "retail");
    expect(() => parser.parse(sector)).toThrow(/Unknown sector: retail/);
  });

  it("accepts a submission that leaves every 'where applicable' question blank", () => {
    const parser = new QualificationFormParser();
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
    const parser = new QualificationFormParser();
    const parsed = parser.parse(fd);
    expect(parsed.answers).toHaveLength(11);
    expect(parsed.answers.find((a) => a.questionId === "2d")?.answer).toBe(
      "Two labelled sets, both scraped in-house.",
    );
  });

  it("keeps one answer per question when a field is posted twice (code review B4)", () => {
    // two answers to one question break the unique (tool, question) only after the card's
    // version was made, which leaves an empty latest version: the first value is kept, as get() does
    const fd = fullySubmittable();
    fd.append("q:annex-2:2d", "First.");
    fd.append("q:annex-2:2d", "Second.");
    const parsed = new QualificationFormParser().parse(fd);
    const twoD = parsed.answers.filter((a) => a.questionId === "2d");
    expect(twoD).toEqual([expect.objectContaining({ answer: "First." })]);
  });

  it("rejects a submission missing a required Annex IV answer", () => {
    const fd = fullySubmittable();
    fd.set("q:annex-2:2g", "   ");
    const parser = new QualificationFormParser();
    expect(() => parser.parse(fd)).toThrow(FormValidationError);
    expect(() => parser.parse(fd)).toThrow(/1 missing/);
  });

  it("ignores answers submitted under retired question ids", () => {
    const fd = fullySubmittable();
    fd.set("q:data:data-source", "Left over from the old form.");
    const parser = new QualificationFormParser();
    const parsed = parser.parse(fd);
    expect(parsed.answers).toHaveLength(10);
    expect(parsed.answers.some((a) => a.toolId === "data")).toBe(false);
  });

  // AIRO-aligned metadata (market form, locality, intended deployers)

  it("requires intended deployers", () => {
    const fd = fullySubmittable();
    fd.set("intendedDeployers", "  ");
    const parser = new QualificationFormParser();
    expect(() => parser.parse(fd)).toThrow(/Intended deployers are required/);
  });

  it("requires at least one market form; the locality may be left empty", () => {
    const parser = new QualificationFormParser();
    const noForm = fullySubmittable();
    noForm.delete("marketFormTags");
    expect(() => parser.parse(noForm)).toThrow(/at least one market form/i);
    // VAIR has three localities and no "other": a system used elsewhere picks none
    const noLoc = fullySubmittable();
    noLoc.delete("localityTags");
    expect(parser.parse(noLoc).localityTags).toEqual([]);
  });

  it("rejects ids outside the AIRO vocabularies", () => {
    const parser = new QualificationFormParser();
    const fd = fullySubmittable();
    fd.append("marketFormTags", "hologram");
    expect(() => parser.parse(fd)).toThrow(/Unknown market form: hologram/);
    const fd2 = fullySubmittable();
    fd2.append("localityTags", "moon");
    expect(() => parser.parse(fd2)).toThrow(/Unknown locality of use: moon/);
  });

  it("returns the new metadata on the parsed result", () => {
    const parser = new QualificationFormParser();
    const parsed = parser.parse(fullySubmittable());
    expect(parsed.marketFormTags).toEqual(["Software"]);
    expect(parsed.localityTags).toEqual(["Workplace"]);
    expect(parsed.intendedDeployers).toBe(
      "Supermarket chains operating the cameras.",
    );
  });

  // Risk block (question 15)

  it("requires at least one risk row", () => {
    const fd = fullySubmittable();
    for (const k of [...fd.keys()]) if (k.startsWith("risk:")) fd.delete(k);
    const parser = new QualificationFormParser();
    expect(() => parser.parse(fd)).toThrow(/at least one risk/i);
  });

  it("parses two rows in order with optional fields as null", () => {
    const fd = fullySubmittable();
    addRisk(fd, 1, {
      risk: "Data poisoning",
      vulnerability: "Unsigned training pipeline",
      followUpControl: "Roll back to previous model",
      followUpControlTerm: "Intervention",
    });
    const parser = new QualificationFormParser();
    const { risks } = parser.parse(fd);
    expect(risks).toHaveLength(2);
    expect(risks[0]).toMatchObject({
      position: 0,
      risk: "Wrong out-of-stock alert",
      vulnerability: null,
      followUpControl: null,
      affected: "user",
      impactAreas: ["Safety"],
    });
    expect(risks[1]).toMatchObject({
      position: 1,
      risk: "Data poisoning",
      vulnerability: "Unsigned training pipeline",
      followUpControl: "Roll back to previous model",
      followUpControlTerm: "Intervention",
    });
  });

  it("skips a completely empty trailing row", () => {
    const fd = fullySubmittable();
    for (const k of ["risk", "source", "consequence", "control"])
      fd.set(`risk:1:${k}`, "");
    const parser = new QualificationFormParser();
    expect(parser.parse(fd).risks).toHaveLength(1);
  });

  it("rejects a row missing a required field, naming the row and field", () => {
    const fd = fullySubmittable();
    fd.set("risk:0:consequence", "  ");
    const parser = new QualificationFormParser();
    expect(() => parser.parse(fd)).toThrow(
      /Risk 1: What happens as a result is required/,
    );
  });

  it("rejects an affected value outside operator/user", () => {
    const fd = fullySubmittable();
    fd.set("risk:0:affected", "subject");
    const parser = new QualificationFormParser();
    expect(() => parser.parse(fd)).toThrow(
      /Risk 1: who is affected is not one of the listed groups/,
    );
  });

  it("requires at least one known area of impact per row", () => {
    const parser = new QualificationFormParser();
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

// The parser takes the resolved form version
//
// parse(formData, form) reads the blocks and questions of `form`. The cases
// above call parse(formData) with no form, which means the default version.

import {
  ALL_BLOCKS,
  customQuestion,
  formVersion,
  loadSrc,
  seededQuestion,
} from "../support/forms";

function identity(): FormData {
  const fd = new FormData();
  fd.set("systemName", "Acme Vision");
  fd.set("systemVersion", "1.0");
  fd.set("company", "Acme");
  return fd;
}

const bare = formVersion({ versionId: "bare-v1", blocks: [], questions: [] });

describe("the identity block is always required (R10)", () => {
  it("R10 a form with no blocks and no questions still needs the three identity fields", () => {
    const parser = new QualificationFormParser();
    for (const [field, message] of [
      ["systemName", /System name is required/],
      ["systemVersion", /Version is required/],
      ["company", /Company is required/],
    ] as const) {
      const fd = identity();
      fd.set(field, "   ");
      expect(() => parser.parse(fd, bare), field).toThrow(FormValidationError);
      expect(() => parser.parse(fd, bare), field).toThrow(message);
      const missing = identity();
      missing.delete(field);
      expect(() => parser.parse(missing, bare), field).toThrow(message);
    }
  });

  it("R10 the identity alone is a complete submission of an empty form", () => {
    const parser = new QualificationFormParser();
    expect(parser.parse(identity(), bare)).toEqual({
      systemName: "Acme Vision",
      systemVersion: "1.0",
      company: "Acme",
      description: "",
      targetUseCase: "",
      targetUsers: "",
      intendedDeployers: null,
      systemType: null,
      purpose: null,
      providerTerm: null,
      deployerTerm: null,
      targetSystemTags: [],
      sectorTags: [],
      marketFormTags: [],
      localityTags: [],
      answers: [],
      risks: [],
      // the Components block is on every card, whatever its form: none posted, none parsed
      systemComponents: [],
      formVersionId: "bare-v1",
    });
  });
});

describe("metadata text fields follow the form's blocks (R11, A5)", () => {
  const cases = [
    ["description", /Description is required/, ""],
    ["targetUseCase", /Target use case is required/, ""],
    ["targetUsers", /Target users are required/, ""],
    ["intendedDeployers", /Intended deployers are required/, null],
  ] as const;

  for (const [field, message] of cases) {
    it(`R11 ${field} in the blocks keeps today's rule: blank is refused`, () => {
      const parser = new QualificationFormParser();
      const fd = identity();
      fd.set(field, "  ");
      expect(() =>
        parser.parse(fd, formVersion({ blocks: [field] as never })),
      ).toThrow(message);
    });
  }

  for (const [field, , absent] of cases) {
    it(`R11 ${field} not in the blocks is ignored even when posted`, () => {
      const parser = new QualificationFormParser();
      const fd = identity();
      fd.set(field, "Posted anyway.");
      expect(parser.parse(fd, bare)[field]).toBe(absent);
    });
  }

  it("R11 an included field is kept, trimmed as today", () => {
    const parser = new QualificationFormParser();
    const fd = identity();
    fd.set("description", "A vision system.");
    expect(
      parser.parse(fd, formVersion({ blocks: ["description"] as never }))
        .description,
    ).toBe("A vision system.");
  });
});

describe("pickers follow the form's blocks (R12)", () => {
  // VAIR terms. Only market form needs a value: VAIR's four forms cover every system,
  // while its capabilities, domains and localities do not.
  const pickers = [
    ["targetSystemTags", null, "ObjectRecognition"],
    ["sectorTags", null, "Employment"],
    ["marketFormTags", /at least one market form/i, "Software"],
    ["localityTags", null, "Workplace"],
  ] as const;

  for (const [block, message, good] of pickers) {
    it(`R12 ${block} in the blocks takes valid values${message ? ", at least one" : ", or none"}`, () => {
      const parser = new QualificationFormParser();
      const form = formVersion({ blocks: [block] as never });
      if (message)
        expect(() => parser.parse(identity(), form)).toThrow(message);
      else expect(parser.parse(identity(), form)[block]).toEqual([]);
      const fd = identity();
      fd.append(block, good);
      expect(parser.parse(fd, form)[block]).toEqual([good]);
    });

    it(`R12 ${block} not in the blocks parses as [] and ignores posted values, even invalid ones`, () => {
      const parser = new QualificationFormParser();
      const fd = identity();
      fd.append(block, "not-a-real-id");
      expect(parser.parse(fd, bare)[block]).toEqual([]);
    });
  }

  it("R12 an included picker still refuses ids outside its vocabulary", () => {
    const parser = new QualificationFormParser();
    const fd = identity();
    fd.append("marketFormTags", "hologram");
    expect(() =>
      parser.parse(fd, formVersion({ blocks: ["marketFormTags"] as never })),
    ).toThrow(/Unknown market form: hologram/);
  });
});

describe("the risk block follows the form's blocks (R13)", () => {
  it('R13 with "risks" in the blocks, today\'s rules hold, including at least one risk', () => {
    const parser = new QualificationFormParser();
    const form = formVersion({ blocks: ["risks"] as never });
    expect(() => parser.parse(identity(), form)).toThrow(
      /Add at least one risk\./,
    );
    const fd = identity();
    addRisk(fd, 0);
    expect(parser.parse(fd, form).risks).toHaveLength(1);
    const bad = identity();
    addRisk(bad, 0, { affected: "subject" });
    expect(() => parser.parse(bad, form)).toThrow(
      /Risk 1: who is affected is not one of the listed groups/,
    );
  });

  it("R13 without it every risk field is ignored and there is no error", () => {
    const parser = new QualificationFormParser();
    const fd = identity();
    addRisk(fd, 0, { affected: "subject" });
    expect(parser.parse(fd, bare).risks).toEqual([]);
  });
});

describe("questions come from the version (R14)", () => {
  const acme = formVersion({
    versionId: "acme-v1",
    questions: [
      customQuestion("acme", "q1", { required: true }),
      customQuestion("acme", "q2", { required: false }),
      customQuestion("acme", "q3", { required: true }),
    ],
  });

  it("R14 counts the required questions left blank", () => {
    const parser = new QualificationFormParser();
    const fd = identity();
    fd.set("q:f-acme:q1", "  ");
    expect(() => parser.parse(fd, acme)).toThrow(
      "Please answer all required questions (2 missing).",
    );
  });

  it("R14 a blank optional question gives no answer; answers are {toolId: scope, questionId: localId}, trimmed", () => {
    const parser = new QualificationFormParser();
    const fd = identity();
    fd.set("q:f-acme:q1", "  First.  ");
    fd.set("q:f-acme:q2", "   ");
    fd.set("q:f-acme:q3", "Third.");
    expect(parser.parse(fd, acme).answers).toEqual([
      { toolId: "f-acme", questionId: "q1", answer: "First." },
      { toolId: "f-acme", questionId: "q3", answer: "Third." },
    ]);
  });

  it("R14 a q: field that is not a question of this version is ignored", () => {
    const parser = new QualificationFormParser();
    const fd = identity();
    fd.set("q:f-acme:q1", "One.");
    fd.set("q:f-acme:q3", "Three.");
    fd.set("q:annex-2:2a", "Not asked on this form.");
    fd.set("q:f-other:q1", "Another form's key.");
    fd.set("q:f-acme:q9", "Not in this version.");
    const answers = parser
      .parse(fd, acme)
      .answers.map((a) => `${a.toolId}:${a.questionId}`);
    expect(answers).toEqual(["f-acme:q1", "f-acme:q3"]);
  });

  it("R14 a mixed version reads seeded and custom questions alike", () => {
    const parser = new QualificationFormParser();
    const mixed = formVersion({
      questions: [seededQuestion("2a"), customQuestion("acme", "q1")],
    });
    const fd = identity();
    fd.set("q:annex-2:2a", "Built from a pre-trained model.");
    fd.set("q:f-acme:q1", "The head of data science.");
    expect(parser.parse(fd, mixed).answers).toEqual([
      {
        toolId: "annex-2",
        questionId: "2a",
        answer: "Built from a pre-trained model.",
      },
      {
        toolId: "f-acme",
        questionId: "q1",
        answer: "The head of data science.",
      },
    ]);
  });

  it("R14 the default version behaves exactly as the parser does today", async () => {
    const { annexDefaultVersion } = await loadSrc("domain/forms/legacy.ts");
    const form = annexDefaultVersion();
    expect(form.blocks).toEqual([...ALL_BLOCKS]);
    const parser = new QualificationFormParser();
    const legacy = parser.parse(fullySubmittable());
    const withForm = parser.parse(fullySubmittable(), form);
    expect({ ...withForm, formVersionId: undefined }).toEqual({
      ...legacy,
      formVersionId: undefined,
    });
    expect(withForm.formVersionId).toBe("annex-iv-default-v1");
    const missing = fullySubmittable();
    missing.set("q:annex-2:2g", "   ");
    expect(() => parser.parse(missing, form)).toThrow(/1 missing/);
    const retired = fullySubmittable();
    retired.set("q:data:data-source", "Left over.");
    expect(parser.parse(retired, form).answers).toHaveLength(10);
  });
});
