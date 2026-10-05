import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { KEY_QUESTIONS, keyQuestionField } from "@/data/keyQuestions";
import {
  QualificationFormParser,
  FormValidationError,
} from "@/server/forms/QualificationFormParser";

// The document prefill. The upload lives on the system's edit page (/qualify/new
// is a redirect), proposes the 21 mapped fields and the risk rows, and never sets tags.
//
// The prefill modules are loaded at run time so this file does not depend on them
// at collection.

const EDIT_PAGE = "src/app/p/[project]/system/edit/page.tsx";
const FORM = "src/app/p/[project]/qualify/new/QualifyForm.tsx";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = (path: string): Promise<any> =>
  import(/* @vite-ignore */ resolve("src", path));

describe("the upload on the edit page (S5.1)", () => {
  it("S5.1 the edit page renders the form that carries the upload control (already passing once W3 is in the tree)", () => {
    expect(readFileSync(EDIT_PAGE, "utf8")).toMatch(/<QualifyForm\b/);
    const form = readFileSync(FORM, "utf8");
    expect(form).toMatch(/import DocumentUpload from/);
    expect(form).toMatch(/<DocumentUpload\b/);
  });

  it("S5.1 a document can propose exactly the 21 mapped fields", async () => {
    const { PREFILLABLE, METADATA_FIELDS } = await load("lib/prefillChoice.ts");
    expect(METADATA_FIELDS.length).toBe(7);
    expect(PREFILLABLE.size).toBe(21);
    for (const q of KEY_QUESTIONS)
      expect(PREFILLABLE.has(keyQuestionField(q))).toBe(true);
  });

  it("S5.1 the prefill field list shared with the service has the same 21 fields", () => {
    const shared = JSON.parse(
      readFileSync("src/data/prefillFields.json", "utf8"),
    );
    // annex: point -> letter -> form field; two letters may share one field
    const annex = new Set(
      Object.values(
        shared.annex as Record<string, Record<string, string>>,
      ).flatMap((group) => Object.values(group)),
    );
    expect(shared.metadata.length + annex.size).toBe(21);
  });
});

describe("tags are chosen, never uploaded (S5.4)", () => {
  it("S5.4 no tag picker is prefillable", async () => {
    const { PREFILLABLE } = await load("lib/prefillChoice.ts");
    for (const tags of [
      "targetSystemTags",
      "sectorTags",
      "marketFormTags",
      "localityTags",
    ]) {
      expect(PREFILLABLE.has(tags)).toBe(false);
    }
  });

  it("S5.4 what the form holds, as sent to the prefill, carries no tags", async () => {
    const { currentAnswers } = await load("lib/prefillChoice.ts");
    const form = new FormData();
    form.append("systemName", "MCAS");
    form.append("marketFormTags", "software");
    form.append("sectorTags", "finance-and-insurance");
    expect(currentAnswers(form)).toEqual({ systemName: "MCAS" });
  });
});

describe("saving an upload with no market form (S5.2)", () => {
  it("S5.2 is refused with 'Pick at least one market form' (already passing)", () => {
    const form = new FormData();
    form.append("systemName", "MCAS");
    form.append("systemVersion", "1");
    form.append("company", "L");
    form.append("description", "d");
    form.append("targetUseCase", "u");
    form.append("targetUsers", "t");
    form.append("intendedDeployers", "Banks");
    form.append("targetSystemTags", "QuestionAnswering");
    form.append("sectorTags", "PrivateService");
    let error: unknown;
    try {
      new QualificationFormParser().parse(form);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(FormValidationError);
    expect(String((error as Error).message)).toMatch(
      /Pick at least one market form/,
    );
  });

  it("S5.2 the save action returns the message instead of redirecting, so the form keeps its answers (already passing)", () => {
    const actions = readFileSync(
      "src/app/p/[project]/qualify/new/actions.ts",
      "utf8",
    );
    expect(actions).toMatch(
      /instanceof FormValidationError\)\s*return \{ error: err\.message \}/,
    );
  });
});
