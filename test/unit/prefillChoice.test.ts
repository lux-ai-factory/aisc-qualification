import { describe, it, expect } from "vitest";
import { answeredFields, needsAChoice, currentAnswers, currentRisks } from "@/lib/prefillChoice";

// Uploading onto an empty form just fills it. Uploading onto a form somebody
// has been typing into is the case that needs asking about, so the question is
// only put when there is something to lose.
describe("whether to ask what to do with what is already there", () => {
  it("an empty form is filled without asking", () => {
    expect(needsAChoice({})).toBe(false);
    expect(needsAChoice({ systemName: "", company: "   " })).toBe(false);
  });

  it("a form with one answer in it is asked about", () => {
    expect(needsAChoice({ systemName: "MCAS" })).toBe(true);
  });

  it("it says which fields are at stake", () => {
    expect(answeredFields({ systemName: "MCAS", company: "", "q:annex-1:1a": "x" })).toEqual([
      "q:annex-1:1a",
      "systemName",
    ]);
  });
});

describe("what the form currently holds", () => {
  function formWith(entries: [string, string][]) {
    const fd = new FormData();
    for (const [k, v] of entries) fd.append(k, v);
    return fd;
  }

  it("reads the metadata and the answers", () => {
    const found = currentAnswers(formWith([["systemName", "MCAS"], ["q:annex-1:1a", "First release."]]));
    expect(found).toEqual({ systemName: "MCAS", "q:annex-1:1a": "First release." });
  });

  it("leaves out the things a document does not propose", () => {
    // Tag pickers and risk rows are chosen, not written, and the reader says
    // nothing about them. Sending them would only invite them to be replaced.
    const found = currentAnswers(
      formWith([
        ["systemName", "MCAS"],
        ["sectorTags", "finance"],
        ["risk:0:name", "Bias"],
        ["intent", "save"],
      ]),
    );
    expect(found).toEqual({ systemName: "MCAS" });
  });

  it("ignores a file that happens to be in the same form", () => {
    const fd = formWith([["systemName", "MCAS"]]);
    fd.append("file", new File(["x"], "doc.txt"));
    expect(currentAnswers(fd)).toEqual({ systemName: "MCAS" });
  });
});

describe("the risk rows the form holds now", () => {
  it("reads each row by its key, with the areas it has chosen", () => {
    const form = new FormData();
    form.set("risk:0:risk", "wrongly refused");
    form.set("risk:0:affected", "user");
    form.append("risk:0:area", "right");
    form.append("risk:0:area", "safety");
    form.set("risk:3:risk", "drift");
    form.set("systemName", "not a risk");
    const rows = currentRisks(form);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ risk: "wrongly refused", affected: "user", areas: ["right", "safety"], control: "" });
    expect(rows[1].risk).toBe("drift");
  });

  it("is empty when there are no rows", () => {
    expect(currentRisks(new FormData())).toEqual([]);
  });
});

// What a document may propose depends on the form
//
// Interface, in src/lib/prefillChoice.ts:
//   prefillableFor(form): Set<string>   identity + included metadata text fields + question fields
//   prefillFormSpec(form): { fields, questions }   what useDocumentPrefill sends
//   currentAnswers(formData, prefillable?)          limited to that set (default: PREFILLABLE)

import * as choice from "@/lib/prefillChoice";
import { KEY_QUESTIONS, keyQuestionField } from "@/data/keyQuestions";
import { customQuestion, formVersion, loadSrc, seededQuestion, setQuestion } from "../support/forms";

describe("the prefillable fields of a form (R40)", () => {
  const acme = formVersion({
    blocks: ["targetUsers", "sectorTags", "risks"] as never,
    questions: [
      customQuestion("acme", "q1", { text: "Who signs off?", citation: "Acme AI Policy §4.2" }),
      customQuestion("acme", "q2", { text: "Tagged?", annexPoint: "2a" as never }),
    ],
  });

  it("R40 are the identity, the included metadata text fields and the questions, never a tag picker", () => {
    expect([...choice.prefillableFor(acme)].sort()).toEqual(
      ["company", "q:f-acme:q1", "q:f-acme:q2", "systemName", "systemVersion", "targetUsers"].sort(),
    );
  });

  it("R40 for the default version they are exactly today's 21", async () => {
    const { annexDefaultVersion } = await loadSrc("domain/forms/legacy.ts");
    const set = choice.prefillableFor(annexDefaultVersion());
    expect(set.size).toBe(21);
    expect([...set].sort()).toEqual([...choice.PREFILLABLE].sort());
    for (const q of KEY_QUESTIONS) expect(set.has(keyQuestionField(q))).toBe(true);
  });

  it('R40 the spec sent to the prefill: identity, included blocks, "risks" when included, every question', () => {
    const spec = choice.prefillFormSpec(acme);
    expect([...spec.fields].sort()).toEqual(
      ["company", "q:f-acme:q1", "q:f-acme:q2", "risks", "sectorTags", "systemName", "systemVersion", "targetUsers"].sort(),
    );
    expect(spec.questions).toEqual([
      { field: "q:f-acme:q1", text: "Who signs off?", citation: "Acme AI Policy §4.2", annexPoint: null },
      { field: "q:f-acme:q2", text: "Tagged?", citation: "", annexPoint: "2a" },
    ]);
  });

  it('R40 no "risks" in the spec when the form has no risk block', () => {
    expect(choice.prefillFormSpec(formVersion({ blocks: [] })).fields).not.toContain("risks");
  });

  it("R40 what the form holds is read against the form's own fields", () => {
    const fd = new FormData();
    fd.append("systemName", "MCAS");
    fd.append("q:f-acme:q1", "The head of data science.");
    fd.append("description", "Not on this form.");
    expect(choice.currentAnswers(fd, choice.prefillableFor(acme))).toEqual({
      systemName: "MCAS",
      "q:f-acme:q1": "The head of data science.",
    });
  });
});

// Prefill uses the pinned wording
//
// The questionnaire version pins
// s-acme:q1 to set v1; set v2 rewords it. The spec sent to the prefill holds the v1 wording,
// because it is built from the resolved questionnaire version only.

describe("the prefill spec of a questionnaire version (T58)", () => {
  const V1_TEXT = "Who signs off a model release?";
  const pinned = formVersion({
    questionnaireId: "mix",
    questionnaireName: "Mix",
    versionId: "mix-v1",
    blocks: ["targetUseCase", "risks"] as never,
    questions: [
      seededQuestion("2a"),
      setQuestion("acme", "q1", {
        text: V1_TEXT,
        citation: "Acme AI Policy §4.2",
        setVersionId: "acme-v1",
        setVersionNumber: 1,
      }),
    ],
  });

  it("T58 questions hold the pinned v1 wording of s-acme:q1, with its field, citation and point", () => {
    const spec = choice.prefillFormSpec(pinned);
    expect(spec.questions).toEqual([
      {
        field: "q:annex-2:2a",
        text: KEY_QUESTIONS.find((k) => k.id === "2a")!.text,
        citation: "Annex IV(2)(a)",
        annexPoint: "2a",
      },
      { field: "q:s-acme:q1", text: V1_TEXT, citation: "Acme AI Policy §4.2", annexPoint: null },
    ]);
    expect(JSON.stringify(spec)).not.toContain("Who signs off a release, v2?");
  });

  it("T58 fields are the identity, the version's blocks, risks when included, and every question field (01 R40)", () => {
    const spec = choice.prefillFormSpec(pinned);
    expect([...spec.fields].sort()).toEqual(
      ["company", "q:annex-2:2a", "q:s-acme:q1", "risks", "systemName", "systemVersion", "targetUseCase"].sort(),
    );
    expect(choice.prefillFormSpec({ ...pinned, blocks: [] }).fields).not.toContain("risks");
  });

  it("T58 useDocumentPrefill takes the resolved questionnaire version (source)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/app/p/[project]/qualify/new/useDocumentPrefill.ts", "utf8");
    expect(src).toMatch(/ResolvedQuestionnaireVersion/);
    expect(src).not.toMatch(/ResolvedFormVersion/);
    expect(src).toMatch(/prefillFormSpec\(/);
  });
});

describe("the component rows the form holds now", () => {
  it("reads each row by its index, with its provider", async () => {
    const { currentComponents } = await import("@/lib/prefillChoice");
    const form = new FormData();
    form.set("component:0:key", "k1");
    form.set("component:0:name", "Scoring model");
    form.set("component:0:type", "DecisionTree");
    form.set("component:0:provider", "in_house");
    form.set("component:3:name", "Hosted LLM");
    form.set("component:3:provider", "third_party");
    form.set("component:3:providerName", "Vendor");
    expect(currentComponents(form)).toEqual([
      { key: "k1", name: "Scoring model", role: "", type: "DecisionTree", provider: "in_house", providerName: "" },
      { key: "", name: "Hosted LLM", role: "", type: "", provider: "third_party", providerName: "Vendor" },
    ]);
  });

  it("counts a row as written when it has a name, a role, a type or a provider's name", async () => {
    const { componentWritten } = await import("@/lib/prefillChoice");
    const blank = { key: "", name: "", role: "", type: "", provider: "in_house" as const, providerName: "" };
    expect(componentWritten(blank)).toBe(false);
    expect(componentWritten({ ...blank, type: "DecisionTree" })).toBe(true);
  });
});
