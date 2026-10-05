import { describe, it, expect } from "vitest";
import {
  loadSrc,
  formVersion,
  setQuestion,
  seededQuestion,
} from "../support/forms";

// The questionnaire builder's save payload: parseQuestionnaireDraft (every message, in check
// order) and sameQuestionnaireContent. An item is only { setVersionId, questionId } and never
// carries wording.

const mod = () => loadSrc("domain/forms/questionnaireDraft.ts");

const item = (questionId = "annex-iv-2a", setVersionId = "annex-iv-v1") => ({
  setVersionId,
  questionId,
});

const draft = (over: Record<string, unknown> = {}) => ({
  name: "Acme AI policy",
  description: "",
  blocks: ["description", "risks"],
  items: [item()],
  ...over,
});

async function error(input: unknown, context?: { takenNames?: string[] }) {
  const { parseQuestionnaireDraft } = await mod();
  const r = parseQuestionnaireDraft(input, context);
  expect(r.ok).toBe(false);
  return r.ok ? null : r.error;
}

async function ok(input: unknown, context?: { takenNames?: string[] }) {
  const { parseQuestionnaireDraft } = await mod();
  const r = parseQuestionnaireDraft(input, context);
  expect(r.ok, JSON.stringify(r)).toBe(true);
  return r.value;
}

describe("parseQuestionnaireDraft accepts a sound draft (T22)", () => {
  it("T22 returns the draft with name and description trimmed", async () => {
    const value = await ok(
      draft({ name: "  Acme AI policy  ", description: "  Ours. " }),
    );
    expect(value.name).toBe("Acme AI policy");
    expect(value.description).toBe("Ours.");
    expect(value.blocks).toEqual(["description", "risks"]);
    expect(value.items).toEqual([
      { setVersionId: "annex-iv-v1", questionId: "annex-iv-2a" },
    ]);
  });

  it("T22 01 A7 zero items and zero blocks are valid", async () => {
    const value = await ok(draft({ blocks: [], items: [] }));
    expect(value.items).toEqual([]);
    expect(value.blocks).toEqual([]);
  });

  it("T22 exactly 200 items, 120 characters of name and 500 of description are valid", async () => {
    await ok(
      draft({
        items: Array.from({ length: 200 }, (_, i) => item(`q${i}`, "acme-v1")),
      }),
    );
    await ok(draft({ name: "x".repeat(120) }));
    await ok(draft({ description: "d".repeat(500) }));
  });

  it("T22 an item carries no wording: extra keys (text, citation, ...) are dropped, never read", async () => {
    const value = await ok(
      draft({
        items: [
          {
            setVersionId: "acme-v1",
            questionId: "acme-q1",
            text: "  ",
            citation: "c".repeat(900),
            required: "maybe",
            annexPoint: "3z",
            kind: "own",
          },
        ],
      }),
    );
    expect(value.items).toEqual([
      { setVersionId: "acme-v1", questionId: "acme-q1" },
    ]);
  });

  it("T22 the same question from two set versions is fine when names are not checked (only duplicates of a questionId are refused)", async () => {
    await ok(
      draft({
        items: [item("acme-q1", "acme-v1"), item("acme-q2", "acme-v2")],
      }),
    );
  });
});

describe("parseQuestionnaireDraft refuses, with the exact message (T22)", () => {
  it("T22 never throws on something that is not a draft: the shape message", async () => {
    const { parseQuestionnaireDraft } = await mod();
    for (const bad of [
      null,
      undefined,
      "draft",
      42,
      [],
      { name: "x" },
      { name: "x", blocks: [], items: "no" },
      { name: "x", blocks: "risks", items: [] },
      { name: 1, blocks: [], items: [] },
      { name: "x", blocks: [], items: [{ questionId: "q" }] },
      { name: "x", blocks: [], items: [{ setVersionId: 2, questionId: "q" }] },
      {
        name: "x",
        blocks: [],
        items: [{ setVersionId: "v", questionId: null }],
      },
      { name: "x", blocks: [], items: [], description: 3 },
    ]) {
      let r: { ok: boolean; error?: string } | undefined;
      expect(() => (r = parseQuestionnaireDraft(bad))).not.toThrow();
      expect(r, JSON.stringify(bad)).toEqual({
        ok: false,
        error: "The questionnaire could not be read.",
      });
    }
  });

  it("T22 a blank name", async () => {
    expect(await error(draft({ name: "   " }))).toBe(
      "Give the questionnaire a name.",
    );
  });

  it("T22 a name longer than 120 characters", async () => {
    expect(await error(draft({ name: "x".repeat(121) }))).toBe(
      "A questionnaire name is at most 120 characters.",
    );
  });

  it("T22 a name in takenNames, ignoring case", async () => {
    expect(await error(draft(), { takenNames: ["Acme AI policy"] })).toBe(
      "A questionnaire called Acme AI policy already exists.",
    );
    expect(
      await error(draft({ name: "ACME ai Policy" }), {
        takenNames: ["acme AI POLICY"],
      }),
    ).toBe("A questionnaire called ACME ai Policy already exists.");
  });

  it("T22 a description over 500 characters", async () => {
    expect(await error(draft({ description: "d".repeat(501) }))).toBe(
      "A description is at most 500 characters.",
    );
  });

  it("T22 a block that is not a part of the questionnaire, the identity fields included", async () => {
    expect(await error(draft({ blocks: ["risks", "colour"] }))).toBe(
      "colour is not a part of the questionnaire.",
    );
    expect(await error(draft({ blocks: ["systemName"] }))).toBe(
      "systemName is not a part of the questionnaire.",
    );
  });

  it("T22 a block listed twice", async () => {
    expect(
      await error(draft({ blocks: ["risks", "description", "risks"] })),
    ).toBe("risks is in the questionnaire twice.");
  });

  it("T22 more than 200 items", async () => {
    const items = Array.from({ length: 201 }, (_, i) =>
      item(`q${i}`, "acme-v1"),
    );
    expect(await error(draft({ items }))).toBe(
      "A questionnaire has at most 200 questions.",
    );
  });

  it("T22 a questionId seen before, even pinned to another set version", async () => {
    expect(
      await error(draft({ items: [item("a"), item("b"), item("a")] })),
    ).toBe("Question 3 is already in the questionnaire.");
    expect(
      await error(
        draft({
          items: [item("acme-q1", "acme-v1"), item("acme-q1", "acme-v2")],
        }),
      ),
    ).toBe("Question 2 is already in the questionnaire.");
  });

  it("T22 the checks run in the spec's order", async () => {
    expect(
      await error(
        draft({ name: "", description: "d".repeat(501), blocks: ["colour"] }),
      ),
    ).toBe("Give the questionnaire a name.");
    expect(
      await error(draft({ description: "d".repeat(501) }), {
        takenNames: ["Acme AI policy"],
      }),
    ).toBe("A questionnaire called Acme AI policy already exists.");
    expect(
      await error(draft({ description: "d".repeat(501), blocks: ["colour"] })),
    ).toBe("A description is at most 500 characters.");
    expect(await error(draft({ blocks: ["colour", "risks", "risks"] }))).toBe(
      "colour is not a part of the questionnaire.",
    );
    const many = Array.from({ length: 201 }, () => item("same"));
    expect(
      await error(draft({ blocks: ["risks", "risks"], items: many })),
    ).toBe("risks is in the questionnaire twice.");
    expect(await error(draft({ items: many }))).toBe(
      "A questionnaire has at most 200 questions.",
    );
  });
});

describe("sameQuestionnaireContent: whether a save would change anything (T23)", () => {
  const version = formVersion({
    blocks: ["description", "risks"] as never,
    questions: [
      setQuestion("acme", "q1", { setVersionId: "acme-v1", text: "A" }),
      seededQuestion("2a"),
    ],
  });
  const same = () => ({
    name: "Acme AI policy",
    description: "",
    blocks: ["description", "risks"],
    items: [
      { setVersionId: "acme-v1", questionId: "acme-q1" },
      { setVersionId: "annex-iv-v1", questionId: "annex-iv-2a" },
    ],
  });

  it("T23 the same blocks and the same (setVersionId, questionId) pairs in order are the same content", async () => {
    const { sameQuestionnaireContent } = await mod();
    expect(sameQuestionnaireContent(same(), version)).toBe(true);
  });

  it("T23 blocks are compared as sets: another order is the same", async () => {
    const { sameQuestionnaireContent } = await mod();
    expect(
      sameQuestionnaireContent(
        { ...same(), blocks: ["risks", "description"] },
        version,
      ),
    ).toBe(true);
  });

  it("T23 the name and description are not content", async () => {
    const { sameQuestionnaireContent } = await mod();
    expect(
      sameQuestionnaireContent(
        { ...same(), name: "Other", description: "x" },
        version,
      ),
    ).toBe(true);
  });

  it("T23 a block added or removed is a change", async () => {
    const { sameQuestionnaireContent } = await mod();
    expect(
      sameQuestionnaireContent({ ...same(), blocks: ["risks"] }, version),
    ).toBe(false);
    expect(
      sameQuestionnaireContent(
        { ...same(), blocks: ["description", "risks", "sectorTags"] },
        version,
      ),
    ).toBe(false);
  });

  it("T23 another order, one item fewer or more is a change", async () => {
    const { sameQuestionnaireContent } = await mod();
    const reversed = same();
    reversed.items.reverse();
    expect(sameQuestionnaireContent(reversed, version)).toBe(false);
    const fewer = same();
    fewer.items.pop();
    expect(sameQuestionnaireContent(fewer, version)).toBe(false);
    const more = same();
    more.items.push({ setVersionId: "annex-iv-v1", questionId: "annex-iv-2b" });
    expect(sameQuestionnaireContent(more, version)).toBe(false);
  });

  it("T23 the same question pinned to another set version is a change, even with identical wording", async () => {
    const { sameQuestionnaireContent } = await mod();
    const repinned = same();
    repinned.items[0] = { setVersionId: "acme-v2", questionId: "acme-q1" };
    expect(sameQuestionnaireContent(repinned, version)).toBe(false);
  });

  it("T23 it is pure", async () => {
    const { sameQuestionnaireContent } = await mod();
    const d = same();
    const before = JSON.stringify([d, version]);
    sameQuestionnaireContent(d, version);
    expect(JSON.stringify([d, version])).toBe(before);
  });
});
