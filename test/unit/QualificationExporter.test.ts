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
    // VAIR terms (2026-09-30), each list with one value that is not a term of its class
    systemType: "NarrowAI",
    purpose: null,
    targetSystemTags: ["QuestionAnswering", "bogus:tag"],
    sectorTags: ["PrivateService", "finance-and-insurance"],
    marketFormTags: ["Software"],
    localityTags: ["Workplace"],
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
        impactAreas: ["Right"],
        control: "K",
        followUpControl: null,
      },
    ],
    ...over,
  } as unknown as QualificationWithAnswers;
}

describe("toExport", () => {
  it("passes the capabilities and sectors as VAIR terms: the builder names them", () => {
    const out = toExport(row());
    expect(out.targetSystemTags).toEqual(["QuestionAnswering"]);
    expect(out.sectorTags).toEqual(["PrivateService"]);
  });

  it("drops a value that is not a VAIR term of its class rather than passing it through", () => {
    const out = toExport(row());
    expect(out.targetSystemTags).toHaveLength(1);
    expect(out.sectorTags).toHaveLength(1);
  });

  it("orders answers by question id so the graph is stable", () => {
    expect(toExport(row()).answers.map((a) => a.questionId)).toEqual([
      "1a",
      "2d",
    ]);
  });

  it("carries the pickers, the deployers and the risk rows through", () => {
    const out = toExport(row());
    expect(out.marketFormTags).toEqual(["Software"]);
    expect(out.localityTags).toEqual(["Workplace"]);
    expect(out.intendedDeployers).toBe("Banks.");
    expect(out.risks[0]).toMatchObject({
      position: 0,
      affected: "user",
      impactAreas: ["Right"],
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
        "purpose",
        "risks",
        "sectorTags",
        "systemName",
        "systemType",
        "systemVersion",
        "targetSystemTags",
        "targetUseCase",
        "targetUsers",
      ].sort(),
    );
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

// ── Form assembly: the export carries the form and each answer's tag ───────
// (spec docs/superpowers/form-assembly-2026-09-24/01-spec.md, R30)
//
// toExport(q, form). Called with no form it is exactly the export above, which
// is what those cases check.

import { customQuestion, formVersion, seededQuestion } from "../support/forms";

// Two-level forms (8.3, T43): the version is a questionnaire version, and each question names
// the question set that words it: ownerSet / ownerSetId (were ownerForm / ownerFormId), in the
// key order key, text, citation, required, annexPoint, ownerSet, ownerSetId, ownerBuiltin.
const mixed = formVersion({
  questionnaireName: "Acme mix",
  versionId: "mix-v2",
  versionNumber: 2,
  questions: [
    seededQuestion("2a"),
    customQuestion("clx9abc", "q1", {
      text: "Who signs off a model release?",
      citation: "Acme AI Policy §4.2",
      setName: "Acme AI policy",
    }),
    seededQuestion("1a"),
  ],
});

const answer = (toolId: string, questionId: string, text: string) => ({
  id: `${toolId}-${questionId}`,
  qualificationId: "q1",
  toolId,
  questionId,
  answer: text,
});

describe("toExport with the card's form version (R30)", () => {
  const q = () =>
    row({
      answers: [
        answer("annex-1", "1a", "First."),
        answer("zz-stray", "q9", "Stored, not in the version."),
        answer("f-clx9abc", "q1", "The head of data science."),
        answer("annex-2", "2a", "Gradient boosting."),
        answer("aa-stray", "q1", "Also stray."),
      ] as never,
    });

  it("R30 each answer carries its citation and Annex tag from the version's snapshot", () => {
    const out = toExport(q(), mixed);
    expect(out.answers.find((a) => a.questionId === "q1" && a.toolId === "f-clx9abc")).toEqual({
      toolId: "f-clx9abc",
      questionId: "q1",
      answer: "The head of data science.",
      citation: "Acme AI Policy §4.2",
      annexPoint: null,
    });
    expect(out.answers.find((a) => a.questionId === "2a")).toEqual({
      toolId: "annex-2",
      questionId: "2a",
      answer: "Gradient boosting.",
      citation: "Annex IV(2)(a)",
      annexPoint: "2a",
    });
  });

  it("R30 answers follow the version's order; stray answers come last, by key", () => {
    const keys = toExport(q(), mixed).answers.map((a) => `${a.toolId}:${a.questionId}`);
    expect(keys).toEqual(["annex-2:2a", "f-clx9abc:q1", "annex-1:1a", "aa-stray:q1", "zz-stray:q9"]);
  });

  it("R30 T43 the export names the questionnaire, its version and its questions in order", () => {
    const out = toExport(q(), mixed) as ReturnType<typeof toExport> & { form: unknown };
    expect(out.form).toEqual({
      name: "Acme mix",
      version: 2,
      questions: [
        {
          key: "annex-2:2a",
          text: seededQuestion("2a").text,
          citation: "Annex IV(2)(a)",
          required: true,
          annexPoint: "2a",
          ownerSet: "Annex IV",
          ownerSetId: "annex-iv",
          ownerBuiltin: true,
        },
        {
          key: "f-clx9abc:q1",
          text: "Who signs off a model release?",
          citation: "Acme AI Policy §4.2",
          required: true,
          annexPoint: null,
          ownerSet: "Acme AI policy",
          ownerSetId: "clx9abc",
          ownerBuiltin: false,
        },
        {
          key: "annex-1:1a",
          text: seededQuestion("1a").text,
          citation: "Annex IV(1)(a)",
          required: true,
          annexPoint: "1a",
          ownerSet: "Annex IV",
          ownerSetId: "annex-iv",
          ownerBuiltin: true,
        },
      ],
    });
  });

  it("R30 a block the form leaves out exports as stored: empty text, null deployers", () => {
    const out = toExport(
      row({ description: "", targetUseCase: "", targetUsers: "", intendedDeployers: null } as never),
      formVersion({ blocks: [] }),
    );
    expect(out).toMatchObject({ description: "", targetUseCase: "", targetUsers: "", intendedDeployers: null });
  });

  it("R30 still JSON as it stands", () => {
    const out = toExport(q(), mixed);
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

// ── Addendum 06 (R69): questions carry their owner form's id ───────────────

describe("toExport names each question's owner by id (R69)", () => {
  it("R69 T43 two sets that share the name Custom questions stay two owners: ownerSetId tells them apart", () => {
    const twoOnce = formVersion({
      questionnaireName: "Mixed once",
      questions: [
        customQuestion("u1", "q1", { setName: "Custom questions", text: "First once?" }),
        customQuestion("u2", "q1", { setName: "Custom questions", text: "Second once?" }),
      ],
    });
    const out = toExport(row({ answers: [] as never }), twoOnce) as ReturnType<typeof toExport> & {
      form: { questions: Array<{ key: string; ownerSet: string; ownerSetId: string }> };
    };
    expect(out.form.questions.map((q) => [q.key, q.ownerSet, q.ownerSetId])).toEqual([
      ["f-u1:q1", "Custom questions", "u1"],
      ["f-u2:q1", "Custom questions", "u2"],
    ]);
  });
});

describe("the owner keys' order (T43)", () => {
  it("T43 each form.questions entry has exactly the keys key, text, citation, required, annexPoint, ownerSet, ownerSetId, ownerBuiltin, in that order", () => {
    const out = toExport(row({ answers: [] as never }), mixed) as ReturnType<typeof toExport> & {
      form: { name: string; version: number; questions: Array<Record<string, unknown>> };
    };
    expect(out.form.name).toBe("Acme mix");
    expect(out.form.version).toBe(2);
    for (const q of out.form.questions) {
      expect(Object.keys(q)).toEqual([
        "key", "text", "citation", "required", "annexPoint", "ownerSet", "ownerSetId", "ownerBuiltin",
      ]);
    }
    expect(out.form.questions[1]).toMatchObject({ ownerSet: "Acme AI policy", ownerSetId: "clx9abc", ownerBuiltin: false });
  });
});
