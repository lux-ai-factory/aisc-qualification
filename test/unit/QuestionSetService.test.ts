import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  FakeQuestionnaireStore,
  idCounter,
} from "../support/fakeQuestionnaireStore";
import { ALL_BLOCKS, loadSrc } from "../support/forms";

// The question-set service, with both repositories replaced by the in-memory store
// (test/support/fakeQuestionnaireStore.ts documents the methods the service may call).
//
// Interface:
//   new QuestionSetService(repository, { newId?, now? })
//   saveDraft(draft, { setId?, origin?, createdBy, alsoQuestionnaire? })
//     -> { ok: true, setId, versionId, number, created, questionnaireId? } | { ok: false, error }
//   list({ retired }) -> SetListRow[]; groups() -> SetGroup[]; history(setId) -> VersionStamp[]
//   resolveSetVersion(id), latest(setId), atNumber(setId, n?) -> ResolvedSetVersion | null
//   retire(setId) -> { ok: true } | { ok: false, error }

const SERVICE = "server/services/QuestionSetService.ts";
const NOW = new Date("2026-09-25T12:00:00.000Z");

let store: FakeQuestionnaireStore;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function service(
  over: { now?: () => Date; prefix?: string } = {},
): Promise<any> {
  const { QuestionSetService } = await loadSrc(SERVICE);
  return new QuestionSetService(store as never, {
    newId: idCounter(over.prefix ?? "s"),
    now: over.now ?? (() => NOW),
  });
}

type Q = {
  questionId?: string;
  text: string;
  citation?: string;
  required?: boolean;
  annexPoint?: string | null;
};
const q = (text: string, over: Partial<Q> = {}) => ({
  text,
  citation: "",
  required: true,
  annexPoint: null,
  ...over,
});
const draft = (over: Record<string, unknown> = {}) => ({
  name: "Acme AI policy",
  description: "",
  questions: [q("A?")],
  ...over,
});

type Saved = {
  ok: true;
  setId: string;
  versionId: string;
  number: number;
  created: boolean;
  questionnaireId?: string;
};
async function saved(result: Promise<unknown>): Promise<Saved> {
  const r = (await result) as { ok: boolean; error?: string } & Record<
    string,
    unknown
  >;
  expect(r.error).toBeUndefined();
  expect(r.ok).toBe(true);
  return r as unknown as Saved;
}

/** A snapshot of every table, to prove a refused save wrote nothing. */
const tables = () =>
  JSON.stringify([
    store.sets,
    store.setVersions,
    store.questions,
    store.setItems,
    store.questionnaires,
    store.questionnaireVersions,
    store.questionnaireItems,
  ]);

beforeEach(() => {
  store = new FakeQuestionnaireStore().seedAnnex();
});

// Creating a set

describe("creating a question set (T14)", () => {
  it("T14 one transaction writes the set, its questions s-<setId>:q1, q2, and v1 with the items in order", async () => {
    const svc = await service();
    const r = await saved(
      svc.saveDraft(
        draft({
          name: "Acme AI policy",
          description: "Our policy.",
          questions: [
            q("A", { citation: "§1", required: true, annexPoint: "2a" }),
            q("B", { required: false }),
          ],
        }),
        { origin: "builder", createdBy: "alice" },
      ),
    );
    expect(r).toMatchObject({ ok: true, number: 1, created: true });
    expect(r.setId).toMatch(/^s\d+$/);
    expect(store.calls.filter((c) => c === "insertSetVersion")).toHaveLength(1);

    const set = store.sets.find((s) => s.id === r.setId)!;
    expect(set).toMatchObject({
      id: r.setId,
      name: "Acme AI policy",
      description: "Our policy.",
      origin: "builder",
      createdBy: "alice",
      retiredAt: null,
    });
    const qs = store.questions.filter((x) => x.setId === r.setId);
    expect(qs.map((x) => [x.scope, x.localId])).toEqual([
      [`s-${r.setId}`, "q1"],
      [`s-${r.setId}`, "q2"],
    ]);
    const version = store.setVersions.find((v) => v.id === r.versionId)!;
    expect(version).toMatchObject({
      setId: r.setId,
      number: 1,
      createdBy: "alice",
    });
    const items = store.setItems
      .filter((i) => i.setVersionId === r.versionId)
      .sort((a, b) => a.position - b.position);
    const byId = (id: string) => qs.find((x) => x.id === id)!.localId;
    expect(
      items.map((i) => ({ ...i, questionId: byId(i.questionId) })),
    ).toEqual([
      {
        setVersionId: r.versionId,
        questionId: "q1",
        position: 0,
        text: "A",
        citation: "§1",
        required: true,
        annexPoint: "2a",
        groupLabel: null,
      },
      {
        setVersionId: r.versionId,
        questionId: "q2",
        position: 1,
        text: "B",
        citation: "",
        required: false,
        annexPoint: null,
        groupLabel: null,
      },
    ]);
    // nothing on the questionnaire side
    expect(store.questionnaires.map((x) => x.id)).toEqual(["annex-iv-default"]);
  });

  it("T14 origin is builder unless the save says import", async () => {
    const svc = await service();
    const a = await saved(
      svc.saveDraft(draft({ name: "One" }), { createdBy: "alice" }),
    );
    const b = await saved(
      svc.saveDraft(draft({ name: "Two" }), {
        origin: "import",
        createdBy: "alice",
      }),
    );
    expect(store.sets.find((s) => s.id === a.setId)!.origin).toBe("builder");
    expect(store.sets.find((s) => s.id === b.setId)!.origin).toBe("import");
  });

  it("T14 a name a non-retired set has, ignoring case, is refused and nothing is written", async () => {
    store.addSet({
      id: "acme",
      name: "Acme AI policy",
      versions: [{ questions: [{ localId: "q1", text: "A?" }] }],
    });
    const before = tables();
    const r = await (
      await service()
    ).saveDraft(draft({ name: "ACME ai POLICY" }), { createdBy: "alice" });
    expect(r).toEqual({
      ok: false,
      error: "A question set called ACME ai POLICY already exists.",
    });
    expect(tables()).toBe(before);
  });

  it("T14 the name of a retired set is not taken", async () => {
    store.addSet({
      id: "old",
      name: "Acme AI policy",
      retiredAt: new Date("2026-09-20T00:00:00Z"),
      versions: [{ questions: [{ localId: "q1", text: "A?" }] }],
    });
    const r = await saved(
      (await service()).saveDraft(draft({ name: "Acme AI policy" }), {
        createdBy: "alice",
      }),
    );
    expect(r.created).toBe(true);
  });

  it("T14 the builtin set's name counts as taken", async () => {
    const r = await (
      await service()
    ).saveDraft(draft({ name: "annex iv" }), { createdBy: "alice" });
    expect(r).toEqual({
      ok: false,
      error: "A question set called annex iv already exists.",
    });
  });

  it("T14 a unique-index race on the new set (P2002) maps to the same message", async () => {
    store.nameRaceOnNextInsert = true;
    const r = await (
      await service()
    ).saveDraft(draft({ name: "Raced" }), { createdBy: "alice" });
    expect(r).toEqual({
      ok: false,
      error: "A question set called Raced already exists.",
    });
  });

  it("T14 an invalid draft is refused with parseSetDraft's message", async () => {
    const r = await (
      await service()
    ).saveDraft(draft({ name: "  " }), { createdBy: "alice" });
    expect(r).toEqual({ ok: false, error: "Give the question set a name." });
    const empty = await (
      await service()
    ).saveDraft(draft({ questions: [] }), { createdBy: "alice" });
    expect(empty).toEqual({
      ok: false,
      error: "A question set needs at least one question.",
    });
  });
});

// Editing a set

describe("editing a set makes its next version (T15)", () => {
  beforeEach(() => {
    store.addSet({
      id: "acme",
      name: "Acme AI policy",
      description: "Policy.",
      versions: [
        {
          questions: [
            { localId: "q1", text: "A" },
            { localId: "q2", text: "B" },
          ],
        },
        {
          questions: [
            { localId: "q1", text: "A", groupLabel: "Governance" },
            {
              localId: "q2",
              text: "B",
              citation: "§2",
              required: false,
              annexPoint: "2d",
            },
          ],
        },
      ],
    });
  });

  const latestDraft = () =>
    draft({
      questions: [
        q("A", { questionId: "acme-q1" }),
        q("B", {
          questionId: "acme-q2",
          citation: "§2",
          required: false,
          annexPoint: "2d",
        }),
      ],
    });

  it("T15 reword q1, remove q2, append C, move q1 after C: v3 is C (s-acme:q3), q1 'A2'; v2 unchanged", async () => {
    const v2Items = JSON.stringify(
      store.setItems.filter((i) => i.setVersionId === "acme-v2"),
    );
    const r = await saved(
      (await service()).saveDraft(
        draft({ questions: [q("C"), q("A2", { questionId: "acme-q1" })] }),
        { setId: "acme", createdBy: "bob" },
      ),
    );
    expect(r).toMatchObject({ setId: "acme", number: 3, created: true });
    const c = store.questions.find(
      (x) => x.setId === "acme" && x.localId === "q3",
    )!;
    expect(c).toMatchObject({ scope: "s-acme", localId: "q3" });
    const items = store.setItems
      .filter((i) => i.setVersionId === r.versionId)
      .sort((a, b) => a.position - b.position);
    expect(items.map((i) => [i.questionId, i.position, i.text])).toEqual([
      [c.id, 0, "C"],
      ["acme-q1", 1, "A2"],
    ]);
    expect(store.setVersions.find((v) => v.id === r.versionId)).toMatchObject({
      number: 3,
      createdBy: "bob",
    });
    expect(
      JSON.stringify(
        store.setItems.filter((i) => i.setVersionId === "acme-v2"),
      ),
    ).toBe(v2Items);
    // q2's identity row is kept
    expect(store.questions.some((x) => x.id === "acme-q2")).toBe(true);
  });

  it("T15 the next local number is max over every question the set owns, never reused", async () => {
    // q2 was removed in v3; a new question in v4 is q3, then q4, never q2 again
    const svc = await service();
    await saved(
      svc.saveDraft(draft({ questions: [q("A", { questionId: "acme-q1" })] }), {
        setId: "acme",
        createdBy: "bob",
      }),
    );
    const r = await saved(
      svc.saveDraft(
        draft({ questions: [q("A", { questionId: "acme-q1" }), q("New")] }),
        { setId: "acme", createdBy: "bob" },
      ),
    );
    expect(r.number).toBe(4);
    const localIds = store.questions
      .filter((x) => x.setId === "acme")
      .map((x) => x.localId)
      .sort();
    expect(localIds).toEqual(["q1", "q2", "q3"]);
  });

  it("T15 a draft equal to the latest version writes nothing and returns it with created false", async () => {
    const before = tables();
    const r = await (
      await service()
    ).saveDraft(latestDraft(), { setId: "acme", createdBy: "bob" });
    expect(r).toEqual({
      ok: true,
      setId: "acme",
      versionId: "acme-v2",
      number: 2,
      created: false,
    });
    expect(tables()).toBe(before);
    expect(store.calls).not.toContain("insertSetVersion");
  });

  it("T15 a question id of another set is refused: Question <n> belongs to another question set.", async () => {
    const r = await (
      await service()
    ).saveDraft(
      draft({
        questions: [
          q("A", { questionId: "acme-q1" }),
          q("Hm", { questionId: "annex-iv-1a" }),
        ],
      }),
      { setId: "acme", createdBy: "bob" },
    );
    expect(r).toEqual({
      ok: false,
      error: "Question 2 belongs to another question set.",
    });
  });

  it("T15 an unknown question id is refused: Question <n> no longer exists.", async () => {
    const r = await (
      await service()
    ).saveDraft(draft({ questions: [q("Gone", { questionId: "nope" })] }), {
      setId: "acme",
      createdBy: "bob",
    });
    expect(r).toEqual({ ok: false, error: "Question 1 no longer exists." });
  });

  it("T15 a builtin, retired or unknown set cannot be changed", async () => {
    store.addSet({
      id: "gone",
      name: "Gone",
      retiredAt: new Date("2026-09-20T00:00:00Z"),
      versions: [{ questions: [{ localId: "q1", text: "G?" }] }],
    });
    const svc = await service();
    for (const setId of ["annex-iv", "gone", "unknown"]) {
      const before = tables();
      const r = await svc.saveDraft(draft({ questions: [q("X")] }), {
        setId,
        createdBy: "bob",
      });
      expect(r, setId).toEqual({
        ok: false,
        error: "That question set cannot be changed.",
      });
      expect(tables(), setId).toBe(before);
    }
  });

  it("T15 two concurrent saves computing the same number: the second is told to reload", async () => {
    store.raceOnNextInsert = true;
    const r = await (
      await service()
    ).saveDraft(draft({ questions: [q("A3", { questionId: "acme-q1" })] }), {
      setId: "acme",
      createdBy: "bob",
    });
    expect(r).toEqual({
      ok: false,
      error:
        "This question set was saved by someone else meanwhile. Reload it and save again.",
    });
  });

  it("T15 D19 an existing question keeps its stored group label; a new question's is null", async () => {
    const r = await saved(
      (await service()).saveDraft(
        draft({
          questions: [q("A reworded", { questionId: "acme-q1" }), q("New")],
        }),
        { setId: "acme", createdBy: "bob" },
      ),
    );
    const items = store.setItems
      .filter((i) => i.setVersionId === r.versionId)
      .sort((a, b) => a.position - b.position);
    expect(items.map((i) => i.groupLabel)).toEqual(["Governance", null]);
  });

  it("T15 D21 the name and description are fixed: an existing set's draft name and description are ignored", async () => {
    const r = await saved(
      (await service()).saveDraft(
        draft({
          name: "Renamed",
          description: "Changed.",
          questions: [q("A2", { questionId: "acme-q1" })],
        }),
        { setId: "acme", createdBy: "bob" },
      ),
    );
    expect(r.created).toBe(true);
    expect(store.sets.find((s) => s.id === "acme")).toMatchObject({
      name: "Acme AI policy",
      description: "Policy.",
    });
    expect(store.sets.filter((s) => s.name === "Renamed")).toEqual([]);
  });

  it("T15 a draft that only changes the name of an existing set is no change", async () => {
    const r = await (
      await service()
    ).saveDraft(
      { ...latestDraft(), name: "Other name" },
      { setId: "acme", createdBy: "bob" },
    );
    expect(r).toMatchObject({ ok: true, number: 2, created: false });
  });

  it("T15 a version resolves to its own wording whatever came after", async () => {
    const svc = await service();
    await saved(
      svc.saveDraft(
        draft({ questions: [q("A2", { questionId: "acme-q1" })] }),
        { setId: "acme", createdBy: "bob" },
      ),
    );
    const v2 = await svc.resolveSetVersion("acme-v2");
    expect(v2.questions.map((x: { text: string }) => x.text)).toEqual([
      "A",
      "B",
    ]);
    expect(
      (await svc.latest("acme")).questions.map((x: { text: string }) => x.text),
    ).toEqual(["A2"]);
    expect((await svc.atNumber("acme", 1)).versionId).toBe("acme-v1");
    expect((await svc.atNumber("acme")).versionNumber).toBe(3);
    expect(await svc.atNumber("acme", 9)).toBeNull();
    expect(await svc.resolveSetVersion("nope")).toBeNull();
  });
});

// Retiring

describe("retiring a set (T19)", () => {
  beforeEach(() => {
    store
      .addSet({
        id: "acme",
        name: "Acme AI policy",
        versions: [{ questions: [{ localId: "q1", text: "Who signs off?" }] }],
      })
      .addQuestionnaire({
        id: "qn",
        name: "Q",
        versions: [
          { items: [{ setVersionId: "acme-v1", questionId: "acme-q1" }] },
        ],
      });
  });

  it("T19 retire sets retired_at to now()", async () => {
    const r = await (await service()).retire("acme");
    expect(r).toEqual({ ok: true });
    expect(store.sets.find((s) => s.id === "acme")!.retiredAt).toEqual(NOW);
  });

  it("T19 a questionnaire version pinned to the set still has the set's wording", async () => {
    await (await service()).retire("acme");
    const pinned = store.questionnaireItems.filter(
      (i) => i.questionnaireVersionId === "qn-v1",
    );
    expect(pinned).toEqual([
      {
        questionnaireVersionId: "qn-v1",
        position: 0,
        setVersionId: "acme-v1",
        questionId: "acme-q1",
      },
    ]);
    const v = await (await service()).resolveSetVersion("acme-v1");
    expect(v).toMatchObject({ setId: "acme", retired: true });
    expect(v.questions[0].text).toBe("Who signs off?");
  });

  it("T19 groups() still returns the retired set, flagged; list() moves it to the retired list", async () => {
    const svc = await service();
    await svc.retire("acme");
    const groups = await svc.groups();
    expect(
      groups.find((g: { setId: string }) => g.setId === "acme"),
    ).toMatchObject({ retired: true, versionId: "acme-v1" });
    expect(
      (await svc.list({ retired: false })).map(
        (r: { setId: string }) => r.setId,
      ),
    ).toEqual(["annex-iv"]);
    expect(
      (await svc.list({ retired: true })).map(
        (r: { setId: string }) => r.setId,
      ),
    ).toEqual(["acme"]);
    expect((await svc.list({ retired: true }))[0].retiredAt).toBe(
      NOW.toISOString(),
    );
  });

  it("T19 a retired set cannot be saved again", async () => {
    const svc = await service();
    await svc.retire("acme");
    const r = await svc.saveDraft(
      draft({ questions: [q("X", { questionId: "acme-q1" })] }),
      { setId: "acme", createdBy: "bob" },
    );
    expect(r).toEqual({
      ok: false,
      error: "That question set cannot be changed.",
    });
  });

  it("T19 D9 the builtin set cannot be retired; unknown or already retired cannot either", async () => {
    const svc = await service();
    expect(await svc.retire("annex-iv")).toEqual({
      ok: false,
      error: "Annex IV cannot be retired.",
    });
    expect(await svc.retire("nope")).toEqual({
      ok: false,
      error: "That question set cannot be retired.",
    });
    await svc.retire("acme");
    expect(await svc.retire("acme")).toEqual({
      ok: false,
      error: "That question set cannot be retired.",
    });
    expect(store.sets.find((s) => s.id === "annex-iv")!.retiredAt).toBeNull();
  });
});

// Groups and list

describe("groups() and list() (T45)", () => {
  beforeEach(() => {
    store
      .addSet({
        id: "zeta",
        name: "zeta checklist",
        versions: [{ questions: [{ localId: "q1", text: "Z?" }] }],
      })
      .addSet({
        id: "acme",
        name: "Acme AI policy",
        versions: [
          {
            createdBy: "alice",
            createdAt: new Date("2026-09-20T10:00:00Z"),
            questions: [{ localId: "q1", text: "A?" }],
          },
          {
            createdBy: "bob",
            createdAt: new Date("2026-09-24T23:59:00Z"),
            questions: [
              { localId: "q2", text: "B?" },
              { localId: "q1", text: "A2?" },
            ],
          },
        ],
      })
      .addSet({
        id: "old",
        name: "Beta retired",
        retiredAt: new Date("2026-09-22T08:00:00Z"),
        versions: [{ questions: [{ localId: "q1", text: "O?" }] }],
      });
  });

  it("T45 one group per set, retired included and flagged, Annex IV first then by name ignoring case", async () => {
    const groups = await (await service()).groups();
    expect(
      groups.map((g: { setId: string; retired: boolean }) => [
        g.setId,
        g.retired,
      ]),
    ).toEqual([
      ["annex-iv", false],
      ["acme", false],
      ["old", true],
      ["zeta", false],
    ]);
  });

  it("T45 each group is the set's latest version, its questions in position order with that version's id and number", async () => {
    const groups = await (await service()).groups();
    const acme = groups.find((g: { setId: string }) => g.setId === "acme");
    expect(acme).toMatchObject({
      setId: "acme",
      setName: "Acme AI policy",
      versionId: "acme-v2",
      versionNumber: 2,
    });
    expect(
      acme.questions.map(
        (x: {
          key: string;
          text: string;
          setVersionId: string;
          setVersionNumber: number;
        }) => [x.key, x.text, x.setVersionId, x.setVersionNumber],
      ),
    ).toEqual([
      ["s-acme:q2", "B?", "acme-v2", 2],
      ["s-acme:q1", "A2?", "acme-v2", 2],
    ]);
    const annex = groups[0];
    expect(annex.questions).toHaveLength(14);
    expect(annex.questions[0]).toMatchObject({
      key: "annex-1:1a",
      setId: "annex-iv",
      setName: "Annex IV",
      setBuiltin: true,
    });
  });

  it("T45 list({retired: false}) gives the non-retired sets' rows, Annex IV first", async () => {
    const rows = await (await service()).list({ retired: false });
    expect(rows.map((r: { setId: string }) => r.setId)).toEqual([
      "annex-iv",
      "acme",
      "zeta",
    ]);
    expect(rows[1]).toEqual({
      setId: "acme",
      name: "Acme AI policy",
      description: "",
      origin: "builder",
      builtin: false,
      versionId: "acme-v2",
      version: 2,
      questionCount: 2,
      savedBy: "bob",
      savedAt: "2026-09-24T23:59:00.000Z",
      retiredAt: null,
    });
    expect(rows[0]).toMatchObject({
      setId: "annex-iv",
      name: "Annex IV",
      builtin: true,
      origin: "builtin",
      savedBy: "system",
      questionCount: 14,
    });
  });

  it("T45 list({retired: true}) gives only the retired sets", async () => {
    const rows = await (await service()).list({ retired: true });
    expect(
      rows.map((r: { setId: string; retiredAt: string }) => [
        r.setId,
        r.retiredAt,
      ]),
    ).toEqual([["old", "2026-09-22T08:00:00.000Z"]]);
  });
});

// alsoQuestionnaire

describe("an import that also makes a questionnaire (T49)", () => {
  it("T49 one transaction: set v1 and a listed questionnaire named as the set, all 9 blocks, items pinned to v1", async () => {
    const r = await saved(
      (await service()).saveDraft(
        draft({
          name: "Imported policy",
          questions: [q("A?"), q("B?", { annexPoint: "2g" })],
        }),
        { origin: "import", createdBy: "carol", alsoQuestionnaire: true },
      ),
    );
    expect(store.calls.filter((c) => c.startsWith("insert"))).toEqual([
      "insertSetVersion",
    ]);
    expect(r.questionnaireId).toBeTruthy();
    const qn = store.questionnaires.find((x) => x.id === r.questionnaireId)!;
    expect(qn).toMatchObject({
      name: "Imported policy",
      origin: "import",
      listed: true,
      createdBy: "carol",
      retiredAt: null,
    });
    const versions = store.questionnaireVersions.filter(
      (v) => v.questionnaireId === qn.id,
    );
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      number: 1,
      blocks: [...ALL_BLOCKS],
      createdBy: "carol",
    });
    const items = store.questionnaireItems
      .filter((i) => i.questionnaireVersionId === versions[0].id)
      .sort((a, b) => a.position - b.position);
    const setItems = store.setItems
      .filter((i) => i.setVersionId === r.versionId)
      .sort((a, b) => a.position - b.position);
    expect(
      items.map((i) => [i.position, i.setVersionId, i.questionId]),
    ).toEqual(setItems.map((i) => [i.position, r.versionId, i.questionId]));
    expect(store.sets.find((s) => s.id === r.setId)).toMatchObject({
      origin: "import",
      createdBy: "carol",
    });
  });

  it("T49 without the box no questionnaire is made", async () => {
    const r = await saved(
      (await service()).saveDraft(draft({ name: "Plain" }), {
        origin: "import",
        createdBy: "carol",
      }),
    );
    expect(r.questionnaireId).toBeUndefined();
    expect(store.questionnaires.map((x) => x.id)).toEqual(["annex-iv-default"]);
  });

  it("T49 a name a listed questionnaire has refuses the whole save and writes nothing", async () => {
    store
      .addSet({
        id: "x",
        name: "Something else",
        versions: [{ questions: [{ localId: "q1", text: "X?" }] }],
      })
      .addQuestionnaire({
        id: "taken",
        name: "Imported policy",
        versions: [{ items: [{ setVersionId: "x-v1", questionId: "x-q1" }] }],
      });
    const before = tables();
    const r = await (
      await service()
    ).saveDraft(draft({ name: "imported POLICY" }), {
      origin: "import",
      createdBy: "carol",
      alsoQuestionnaire: true,
    });
    expect(r).toEqual({
      ok: false,
      error: "A questionnaire called imported POLICY already exists.",
    });
    expect(tables()).toBe(before);
  });
});

// History

describe("who and when (T57)", () => {
  it("T57 history(setId) is every version's stamp, newest first, createdAt ISO 8601 in UTC", async () => {
    store.addSet({
      id: "acme",
      name: "Acme AI policy",
      versions: [
        {
          createdBy: "alice",
          createdAt: new Date("2026-09-20T10:00:00Z"),
          questions: [{ localId: "q1", text: "A?" }],
        },
        {
          createdBy: "bob",
          createdAt: new Date("2026-09-24T23:59:00Z"),
          questions: [{ localId: "q1", text: "A2?" }],
        },
      ],
    });
    expect(await (await service()).history("acme")).toEqual([
      {
        versionId: "acme-v2",
        number: 2,
        createdAt: "2026-09-24T23:59:00.000Z",
        createdBy: "bob",
      },
      {
        versionId: "acme-v1",
        number: 1,
        createdAt: "2026-09-20T10:00:00.000Z",
        createdBy: "alice",
      },
    ]);
  });

  it("T57 the builtin set's history is v1 by system; an unknown set's is empty", async () => {
    const svc = await service();
    const h = await svc.history("annex-iv");
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({
      versionId: "annex-iv-v1",
      number: 1,
      createdBy: "system",
    });
    expect(h[0].createdAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    expect(await svc.history("nope")).toEqual([]);
  });

  it("T57 T55 a save stores its createdBy on the set and the version", async () => {
    const svc = await service();
    const r = await saved(
      svc.saveDraft(draft({ name: "Mine" }), { createdBy: "dora" }),
    );
    expect((await svc.history(r.setId))[0]).toMatchObject({
      number: 1,
      createdBy: "dora",
    });
    expect(store.sets.find((s) => s.id === r.setId)!.createdBy).toBe("dora");
  });
});

// Install-wide

describe("question sets are install-wide (T63)", () => {
  it("T63 no public method takes a project or projectId parameter", async () => {
    const { QuestionSetService } = await loadSrc(SERVICE);
    const names = Object.getOwnPropertyNames(
      QuestionSetService.prototype,
    ).filter((n) => n !== "constructor");
    expect(names).toEqual(
      expect.arrayContaining([
        "list",
        "groups",
        "resolveSetVersion",
        "latest",
        "atNumber",
        "history",
        "saveDraft",
        "retire",
      ]),
    );
    for (const n of names) {
      const src = String(QuestionSetService.prototype[n]);
      const params = src.slice(src.indexOf("("), src.indexOf(")") + 1);
      expect(params, n).not.toMatch(/\bproject(Id)?\b/i);
    }
  });

  it("T63 the source does not mention projectId or project_id", () => {
    const text = readFileSync(
      "src/server/services/QuestionSetService.ts",
      "utf8",
    );
    expect(text).not.toMatch(/projectId|project_id/);
  });

  it("T63 a set saved from one project is listed, grouped and resolved identically for another", async () => {
    const r = await saved(
      (await service()).saveDraft(draft({ name: "Shared" }), {
        createdBy: "alice",
      }),
    );
    const a = await service();
    const b = await service({ prefix: "other" });
    expect(await b.list({ retired: false })).toEqual(
      await a.list({ retired: false }),
    );
    expect(await b.groups()).toEqual(await a.groups());
    expect(await b.resolveSetVersion(r.versionId)).toEqual(
      await a.resolveSetVersion(r.versionId),
    );
    expect(
      (await b.list({ retired: false })).map((x: { setId: string }) => x.setId),
    ).toContain(r.setId);
  });
});
