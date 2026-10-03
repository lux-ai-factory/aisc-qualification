import { describe, it, expect } from "vitest";
import { loadSrc, setQuestion, setVersion } from "../support/forms";

// The question-set editor's save payload, validated before anything is written: parseSetDraft
// (every message, in check order) and sameSetContent.
//
// SetDraft = { name, description?, questions: [{ questionId?, text, citation, required, annexPoint }] }

const mod = () => loadSrc("domain/forms/questionSetDraft.ts");

const q = (over: Record<string, unknown> = {}) => ({
  text: "Who signs off a model release?",
  citation: "Acme AI Policy §4.2",
  required: true,
  annexPoint: null,
  ...over,
});

const draft = (over: Record<string, unknown> = {}) => ({
  name: "Acme AI policy",
  description: "",
  questions: [q()],
  ...over,
});

async function error(input: unknown, context?: { takenNames?: string[] }) {
  const { parseSetDraft } = await mod();
  const r = parseSetDraft(input, context);
  expect(r.ok).toBe(false);
  return r.ok ? null : r.error;
}

async function ok(input: unknown, context?: { takenNames?: string[] }) {
  const { parseSetDraft } = await mod();
  const r = parseSetDraft(input, context);
  expect(r.ok, JSON.stringify(r)).toBe(true);
  return r.value;
}

describe("parseSetDraft accepts a sound draft (T12)", () => {
  it("T12 returns the draft with name, description, text and citation trimmed", async () => {
    const value = await ok(
      draft({
        name: "  Acme AI policy  ",
        description: "  Our policy.  ",
        questions: [q({ text: "  Who signs off?  ", citation: "  §4.2 " })],
      }),
    );
    expect(value.name).toBe("Acme AI policy");
    expect(value.description).toBe("Our policy.");
    expect(value.questions).toEqual([
      { text: "Who signs off?", citation: "§4.2", required: true, annexPoint: null },
    ]);
  });

  it("T12 keeps a questionId, and takes an Annex IV point of the 14", async () => {
    const value = await ok(draft({ questions: [q({ questionId: "acme-q1", annexPoint: "2a" }), q({ text: "B" })] }));
    expect(value.questions[0]).toMatchObject({ questionId: "acme-q1", annexPoint: "2a" });
    expect(value.questions[1].questionId).toBeUndefined();
  });

  it("T12 description is optional", async () => {
    const { description: _d, ...rest } = draft();
    void _d;
    expect((await ok(rest)).name).toBe("Acme AI policy");
  });

  it("T12 exactly 120 characters of name, 500 of description, 200 questions, 2000 of text, 200 of citation are valid", async () => {
    await ok(draft({ name: "x".repeat(120) }));
    await ok(draft({ description: "d".repeat(500) }));
    await ok(draft({ questions: Array.from({ length: 200 }, (_, i) => q({ text: `Question ${i}?` })) }));
    await ok(draft({ questions: [q({ text: "x".repeat(2000) })] }));
    await ok(draft({ questions: [q({ citation: "c".repeat(200) })] }));
  });

  it("T12 a name in takenNames is fine when no names are given to check against", async () => {
    await ok(draft());
  });
});

describe("parseSetDraft refuses, with the exact message (T12)", () => {
  it("T12 never throws on something that is not a draft: the shape message", async () => {
    const { parseSetDraft } = await mod();
    for (const bad of [
      null,
      undefined,
      "draft",
      42,
      [],
      { name: "x" },
      { name: "x", questions: "no" },
      { name: 3, questions: [] },
      { name: "x", questions: [{ text: 1, citation: "", required: true, annexPoint: null }] },
      { name: "x", questions: [{ text: "t", citation: "", required: "yes", annexPoint: null }] },
      { name: "x", questions: [{ text: "t", citation: "", required: true, annexPoint: null, questionId: 7 }] },
      { name: "x", description: 5, questions: [] },
    ]) {
      let r: { ok: boolean; error?: string } | undefined;
      expect(() => (r = parseSetDraft(bad))).not.toThrow();
      expect(r, JSON.stringify(bad)).toEqual({ ok: false, error: "The question set could not be read." });
    }
  });

  it("T12 a blank name", async () => {
    expect(await error(draft({ name: "   " }))).toBe("Give the question set a name.");
  });

  it("T12 a name longer than 120 characters", async () => {
    expect(await error(draft({ name: "x".repeat(121) }))).toBe("A question set name is at most 120 characters.");
  });

  it("T12 a name in takenNames, ignoring case", async () => {
    expect(await error(draft(), { takenNames: ["Acme AI policy"] })).toBe(
      "A question set called Acme AI policy already exists.",
    );
    expect(await error(draft({ name: "ACME ai Policy" }), { takenNames: ["Acme AI policy"] })).toBe(
      "A question set called ACME ai Policy already exists.",
    );
  });

  it("T12 a description over 500 characters", async () => {
    expect(await error(draft({ description: "d".repeat(501) }))).toBe("A description is at most 500 characters.");
  });

  it("T12 D18 zero questions", async () => {
    expect(await error(draft({ questions: [] }))).toBe("A question set needs at least one question.");
  });

  it("T12 more than 200 questions", async () => {
    const questions = Array.from({ length: 201 }, (_, i) => q({ text: `Question ${i}?` }));
    expect(await error(draft({ questions }))).toBe("A question set has at most 200 questions.");
  });

  it("T12 blank text names the 1-based position", async () => {
    expect(await error(draft({ questions: [q(), q({ text: "   " })] }))).toBe("Question 2 has no text.");
  });

  it("T12 text over 2000 characters", async () => {
    expect(await error(draft({ questions: [q({ text: "x".repeat(2001) })] }))).toBe(
      "Question 1 is longer than 2000 characters.",
    );
  });

  it("T12 a citation over 200 characters", async () => {
    expect(await error(draft({ questions: [q(), q({ citation: "c".repeat(201) })] }))).toBe(
      "The citation of question 2 is longer than 200 characters.",
    );
  });

  it("T12 an Annex IV point outside the 14", async () => {
    for (const bad of ["3a", "1d", "Annex IV(2)(a)"]) {
      expect(await error(draft({ questions: [q({ annexPoint: bad })] }))).toBe(
        "Question 1 names an Annex IV point that does not exist.",
      );
    }
  });

  it("T12 a questionId seen before", async () => {
    const mine = q({ questionId: "acme-q1" });
    expect(await error(draft({ questions: [q(), mine, mine] }))).toBe("Question 3 is already in the question set.");
  });

  it("T12 the checks run in the spec's order: the first failing one is reported", async () => {
    // blank name beats everything after it
    expect(await error(draft({ name: " ", description: "d".repeat(501), questions: [] }))).toBe(
      "Give the question set a name.",
    );
    // a taken name beats the description
    expect(await error(draft({ description: "d".repeat(501) }), { takenNames: ["acme ai policy"] })).toBe(
      "A question set called Acme AI policy already exists.",
    );
    // the description beats zero questions
    expect(await error(draft({ description: "d".repeat(501), questions: [] }))).toBe(
      "A description is at most 500 characters.",
    );
    // over 200 beats a bad question inside
    const many = Array.from({ length: 201 }, () => q({ text: " " }));
    expect(await error(draft({ questions: many }))).toBe("A question set has at most 200 questions.");
    // within a question: text before citation before point
    expect(await error(draft({ questions: [q({ text: " ", citation: "c".repeat(201), annexPoint: "3a" })] }))).toBe(
      "Question 1 has no text.",
    );
    expect(await error(draft({ questions: [q({ citation: "c".repeat(201), annexPoint: "3a" })] }))).toBe(
      "The citation of question 1 is longer than 200 characters.",
    );
    // question 1's error before question 2's
    expect(await error(draft({ questions: [q({ annexPoint: "3a" }), q({ text: "" })] }))).toBe(
      "Question 1 names an Annex IV point that does not exist.",
    );
  });
});

describe("sameSetContent: whether a save would change anything (T13)", () => {
  const latest = setVersion({
    versionId: "acme-v2",
    versionNumber: 2,
    questions: [
      setQuestion("acme", "q1", { text: "A", citation: "Acme §1", required: true, annexPoint: "2a" as never }),
      setQuestion("acme", "q2", { text: "B", citation: "", required: false, annexPoint: null, groupLabel: "Oversight" }),
    ],
  });
  const same = () => ({
    name: "Acme AI policy",
    description: "",
    questions: [
      { questionId: "acme-q1", text: "A", citation: "Acme §1", required: true, annexPoint: "2a" },
      { questionId: "acme-q2", text: "B", citation: "", required: false, annexPoint: null },
    ],
  });

  it("T13 the same questions, identically worded, in the same order are the same content", async () => {
    const { sameSetContent } = await mod();
    expect(sameSetContent(same(), latest)).toBe(true);
  });

  it("T13 name and description are not content", async () => {
    const { sameSetContent } = await mod();
    expect(sameSetContent({ ...same(), name: "Other", description: "Changed" }, latest)).toBe(true);
  });

  it("T13 group labels are not in the draft and not compared", async () => {
    const { sameSetContent } = await mod();
    expect(sameSetContent(same(), latest)).toBe(true);
  });

  it("T13 a changed text, citation, required flag or Annex point is a change", async () => {
    const { sameSetContent } = await mod();
    for (const change of [{ text: "A2" }, { citation: "Acme §2" }, { required: false }, { annexPoint: null }]) {
      const d = same();
      Object.assign(d.questions[0], change);
      expect(sameSetContent(d, latest), JSON.stringify(change)).toBe(false);
    }
  });

  it("T13 another order, one question fewer or one more is a change", async () => {
    const { sameSetContent } = await mod();
    const reversed = same();
    reversed.questions.reverse();
    expect(sameSetContent(reversed, latest)).toBe(false);
    const fewer = same();
    fewer.questions.pop();
    expect(sameSetContent(fewer, latest)).toBe(false);
    const more = same();
    more.questions.push({ questionId: "acme-q3", text: "C", citation: "", required: true, annexPoint: null });
    expect(sameSetContent(more, latest)).toBe(false);
  });

  it("T13 a question without questionId is always a change, even with identical wording", async () => {
    const { sameSetContent } = await mod();
    const d = same();
    delete (d.questions[1] as { questionId?: string }).questionId;
    expect(sameSetContent(d, latest)).toBe(false);
  });

  it("T13 another questionId at an index is a change", async () => {
    const { sameSetContent } = await mod();
    const d = same();
    d.questions[0].questionId = "acme-q9";
    expect(sameSetContent(d, latest)).toBe(false);
  });

  it("T13 it is pure: the draft and the version are not changed", async () => {
    const { sameSetContent } = await mod();
    const d = same();
    const before = JSON.stringify([d, latest]);
    sameSetContent(d, latest);
    expect(JSON.stringify([d, latest])).toBe(before);
  });
});
