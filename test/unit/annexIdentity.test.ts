import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { loadSrc } from "../support/forms";
import { mcasCard } from "../support/mcasCard";

// Two-level forms (docs/superpowers/two-level-forms-2026-09-25/01-spec.md), T10: an Annex IV card
// exports the same answers and form header as before (proof on paper, spec 4.3 point 3).
//
// test/fixtures/mcas-export-before.json is
//   JSON.stringify(toExport(mcasCard(), annexDefaultVersion()), null, 2)
// written from the code BEFORE the change (2026-09-25, form assembly still in place). After the
// change the same card and the new annexDefaultVersion() export the same bytes, except that each
// form.questions[] entry's owner keys are renamed: ownerForm -> ownerSet "Annex IV", ownerFormId
// -> ownerSetId "annex-iv", in the key order key, text, citation, required, annexPoint, ownerSet,
// ownerSetId, ownerBuiltin (T43).

const FIXTURE = "test/fixtures/mcas-export-before.json";

type Q = Record<string, unknown>;
const before = () => JSON.parse(readFileSync(FIXTURE, "utf8"));

/** The fixture as the new code must write it: only the owner keys of each question change. */
function expectedAfter() {
  const x = before();
  x.form.questions = x.form.questions.map((q: Q) => ({
    key: q.key,
    text: q.text,
    citation: q.citation,
    required: q.required,
    annexPoint: q.annexPoint,
    ownerSet: "Annex IV",
    ownerSetId: "annex-iv",
    ownerBuiltin: q.ownerBuiltin,
  }));
  return x;
}

async function exportNow() {
  const { toExport } = await loadSrc("server/services/QualificationExporter.ts");
  const { annexDefaultVersion } = await loadSrc("domain/forms/legacy.ts");
  return toExport(mcasCard(), annexDefaultVersion());
}

describe("the fixture written before the change (T10)", () => {
  it("T10 is JSON.stringify(x, null, 2) of an export of the Annex IV default with 14 questions owned by the old form", () => {
    const text = readFileSync(FIXTURE, "utf8");
    const x = JSON.parse(text);
    expect(JSON.stringify(x, null, 2)).toBe(text);
    expect(x.form).toMatchObject({ name: "Annex IV default", version: 1 });
    expect(x.form.questions).toHaveLength(14);
    for (const q of x.form.questions) {
      expect(Object.keys(q)).toEqual([
        "key", "text", "citation", "required", "annexPoint", "ownerForm", "ownerFormId", "ownerBuiltin",
      ]);
      expect(q).toMatchObject({ ownerForm: "Annex IV default", ownerFormId: "annex-iv-default", ownerBuiltin: true });
    }
    expect(x.answers).toHaveLength(14);
  });
});

describe("an Annex IV card exports as before (T10)", () => {
  it("T10 toExport(the MCAS card, annexDefaultVersion()) is the fixture byte for byte, owner keys renamed", async () => {
    const now = await exportNow();
    expect(JSON.stringify(now, null, 2)).toBe(JSON.stringify(expectedAfter(), null, 2));
  });

  it("T10 answers, their order, form.name, form.version, metadata and risks are the fixture's", async () => {
    const now = await exportNow();
    const was = before();
    expect(now.answers).toEqual(was.answers);
    expect(now.form.name).toBe("Annex IV default");
    expect(now.form.version).toBe(1);
    expect(now.risks).toEqual(was.risks);
    const { form: _a, ...restNow } = now;
    const { form: _b, ...restWas } = was;
    void _a;
    void _b;
    expect(restNow).toEqual(restWas);
  });

  it("T10 T43 each question's keys are key, text, citation, required, annexPoint, ownerSet, ownerSetId, ownerBuiltin, in that order", async () => {
    const now = await exportNow();
    for (const q of now.form.questions) {
      expect(Object.keys(q)).toEqual([
        "key", "text", "citation", "required", "annexPoint", "ownerSet", "ownerSetId", "ownerBuiltin",
      ]);
      expect(q).toMatchObject({ ownerSet: "Annex IV", ownerSetId: "annex-iv", ownerBuiltin: true });
    }
  });
});
