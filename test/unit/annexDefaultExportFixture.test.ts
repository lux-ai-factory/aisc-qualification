import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { annexDefaultVersion } from "@/domain/forms/legacy";

// The Python round-trip test exports the 14 Annex IV default
// questions from a committed fixture. This keeps that fixture equal to the TS
// default form (and so to KEY_QUESTIONS), so the round trip tests the real form.

const FIXTURE = "services/prefill/tests/fixtures/annex_iv_default_form.json";

describe("the Annex IV default export fixture (R54)", () => {
  const fixture = () => JSON.parse(readFileSync(FIXTURE, "utf8"));

  it('R54 is "Annex IV default", version 1', () => {
    expect(fixture()).toMatchObject({ name: "Annex IV default", version: 1 });
  });

  it("R54 its questions are annexDefaultVersion().questions as {text, citation, required, annexPoint}, in order", () => {
    const expected = annexDefaultVersion().questions.map((q) => ({
      text: q.text,
      citation: q.citation,
      required: q.required,
      annexPoint: q.annexPoint,
    }));
    expect(fixture().questions).toEqual(expected);
  });
});
