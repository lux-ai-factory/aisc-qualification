import { describe, expect, it } from "vitest";
import { parseSetDraft } from "@/domain/forms/questionSetDraft";
import { toResolvedQuestion } from "@/server/services/QuestionSetService";

// A question someone writes names its source in its citation, in whatever regulation it comes from; it
// is not tied to an Annex IV point. Only the built-in Annex IV questions are the points, by construction.
// So a posted point is dropped when a set is saved, and a point an older custom question still has
// stored is not read.

const question = (annexPoint: unknown) => ({
  text: "Who signs off the model?",
  citation: "ISO/IEC 42001 5.3",
  required: false,
  annexPoint,
});

describe("saving a custom question set", () => {
  it.each(["2a", "zz"])("drops a posted Annex IV point (%s) instead of keeping or refusing it", (point) => {
    const parsed = parseSetDraft({ name: "Governance", questions: [question(point)] });
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.value.questions[0]).not.toHaveProperty("annexPoint");
  });

  it("reads a draft that names no point at all", () => {
    const { annexPoint: _gone, ...noPoint } = question(null);
    expect(parseSetDraft({ name: "Governance", questions: [noPoint] }).ok).toBe(true);
  });
});

describe("reading a stored question", () => {
  const item = (annexPoint: string | null) => ({
    questionId: "q1",
    text: "t",
    citation: "c",
    required: false,
    annexPoint,
    groupLabel: null,
    question: { id: "q1", scope: "s-x", localId: "q1" },
  });
  const version = (origin: string) => ({ id: "v1", number: 1, set: { id: "x", name: "X", origin } });

  it("ignores the point an older custom question has stored", () => {
    expect(toResolvedQuestion(item("2a"), version("builder")).annexPoint).toBeNull();
  });

  it("keeps the point of a built-in Annex IV question", () => {
    expect(toResolvedQuestion(item("2a"), version("builtin")).annexPoint).toBe("2a");
  });
});
