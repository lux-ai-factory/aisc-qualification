import { describe, expect, it } from "vitest";
import { OPERATORS, SUBJECTS } from "@/data/vairVocab";

describe("people vocabularies", () => {
  it("offers VAIR's operators and subjects", () => {
    expect(OPERATORS.length).toBe(17);
    expect(SUBJECTS.map((t) => t.id)).toContain("JobApplicant");
  });
});
