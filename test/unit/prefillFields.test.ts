import { describe, it, expect } from "vitest";
import fields from "@/data/prefillFields.json";
import { KEY_QUESTIONS, keyQuestionField } from "@/data/keyQuestions";
import { METADATA_FIELDS } from "@/lib/prefillChoice";

// The prefill service is Python and the form is here, so the mapping from an
// Annex point to a form field is shared as a file rather than written twice.
// This is what stops the two drifting: change the question set and this fails
// until the file says so too.
describe("the fields the prefill service may propose", () => {
  it("names every question the form asks, and no other", () => {
    const fromTheForm = new Set(KEY_QUESTIONS.map(keyQuestionField));
    const fromTheFile = new Set(
      Object.values(fields.annex).flatMap((letters) => Object.values(letters)),
    );
    expect([...fromTheFile].sort()).toEqual([...fromTheForm].sort());
  });

  it("maps the merged questions from either letter", () => {
    // The form merges Annex IV 1(d) with 1(e) and 1(g) with 1(h); a document
    // that uses either letter is talking about the same question.
    expect(fields.annex["1"].d).toBe(fields.annex["1"].e);
    expect(fields.annex["1"].g).toBe(fields.annex["1"].h);
  });

  it("names the same metadata the form has", () => {
    expect([...fields.metadata].sort()).toEqual([...METADATA_FIELDS].sort());
  });
});
