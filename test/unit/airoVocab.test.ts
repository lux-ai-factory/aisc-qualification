import { describe, it, expect } from "vitest";
import * as airoVocab from "@/data/airoVocab";
import { AFFECTED, isAffected, vocabLabel } from "@/data/airoVocab";

// Our own picker lists hold only what VAIR has no vocabulary for: who a risk affects.
// Market form, locality and areas of impact are VAIR's (vairVocab.ts, test/unit/vairForm.test.ts).
describe("airoVocab", () => {
  it("keeps only the list VAIR has no vocabulary for", () => {
    expect(AFFECTED.map((e) => e.id)).toEqual(["operator", "user"]);
    expect(Object.keys(airoVocab).sort()).toEqual([
      "AFFECTED",
      "isAffected",
      "vocabLabel",
    ]);
  });

  it("validates ids", () => {
    expect(isAffected("user")).toBe(true);
    expect(isAffected("subject")).toBe(false);
  });

  it("resolves a label and falls back to the id", () => {
    expect(vocabLabel(AFFECTED, "user")).toMatch(/^User/);
    expect(vocabLabel(AFFECTED, "bogus")).toBe("bogus");
  });
});
