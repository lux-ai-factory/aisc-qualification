import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { FakeQuestionnaireStore, idCounter } from "../support/fakeQuestionnaireStore";
import { ALL_BLOCKS, loadSrc } from "../support/forms";

// Two-level forms (docs/superpowers/two-level-forms-2026-09-25/01-spec.md): the questionnaire
// service, with its repository replaced by the in-memory store
// (test/support/fakeQuestionnaireStore.ts documents the methods the service may call).
// T24, T25, T35, T46, T53, T54, T57, T63. Replaces the questionnaire half of the old
// test/unit/FormService.test.ts (spec 8.2): its R3/R43 library, R6/R7 resolve, R47
// install-wide, R57 exportable, R60 to R62 pinning and R68 use-once cases live on here.
//
// Interface (spec 5.3, and the lead's interfaces note where the spec is silent):
//   new QuestionnaireService(repository, { newId?, now? })
//   saveDraft(draft, { questionnaireId?, listed, origin?, createdBy, systemName? })
//     -> { ok: true, questionnaireId, versionId, number, created } | { ok: false, error }
//   resolve(id | null), latestVersion(id), exportable(id, n?) -> ResolvedQuestionnaireVersion | null
//   library({ retired }), chooserOptions(), history(id), retire(id)
//   resolveReferences(items) -> { ok: true, picks: [{ question, setVersionId }] } | { ok: false, missing }
//   importSelfContained(file, { setName, questionnaireName, createdBy })
//     -> { ok: true, setId, questionnaireId, versionId } | { ok: false, error }

const SERVICE = "server/services/QuestionnaireService.ts";
/** 2026-09-25 late in the day, UTC: the use-once name's date (06 R67). */
const NOW = new Date("2026-09-25T23:30:00.000Z");

let store: FakeQuestionnaireStore;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function service(prefix = "n"): Promise<any> {
  const { QuestionnaireService } = await loadSrc(SERVICE);
  return new QuestionnaireService(store as never, { newId: idCounter(prefix), now: () => NOW });
}

const item = (setVersionId: string, questionId: string) => ({ setVersionId, questionId });
const draft = (over: Record<string, unknown> = {}) => ({
  name: "Acme questionnaire",
  description: "",
  blocks: [],
  items: [item("annex-iv-v1", "annex-iv-2a")],
  ...over,
});

type Saved = { ok: true; questionnaireId: string; versionId: string; number: number; created: boolean };
async function saved(result: Promise<unknown>): Promise<Saved> {
  const r = (await result) as { ok: boolean; error?: string } & Record<string, unknown>;
  expect(r.error).toBeUndefined();
  expect(r.ok).toBe(true);
  return r as unknown as Saved;
}

const setTables = () => JSON.stringify([store.sets, store.setVersions, store.questions, store.setItems]);
const allTables = () =>
  JSON.stringify([
    store.sets, store.setVersions, store.questions, store.setItems,
    store.questionnaires, store.questionnaireVersions, store.questionnaireItems,
  ]);

/** Set "Acme AI policy" (acme): v1 q1 "A", v2 q1 "B", v3 q1 "C" (each rewording it). */
function seedAcme() {
  store.addSet({
    id: "acme",
    name: "Acme AI policy",
    versions: [
      { questions: [{ localId: "q1", text: "A", citation: "Acme AI Policy §4.2" }, { localId: "q2", text: "Data?" }] },
      { questions: [{ localId: "q1", text: "B", citation: "Acme AI Policy §4.2" }, { localId: "q2", text: "Data?" }] },
      { questions: [{ localId: "q1", text: "C", citation: "Acme AI Policy §4.2" }, { localId: "q2", text: "Data?" }] },
    ],
  });
}

beforeEach(() => {
  store = new FakeQuestionnaireStore().seedAnnex();
});

// ── T24 saving never authors a question ─────────────────────────────────────

describe("saving a questionnaire never authors a question (T24)", () => {
  beforeEach(seedAcme);

  it("T24 one transaction writes the questionnaire, v1 and one item per draft item; no set-side row", async () => {
    const before = setTables();
    const r = await saved(
      (await service()).saveDraft(
        draft({
          name: "Acme questionnaire",
          description: "Ours.",
          blocks: ["risks", "description"],
          items: [item("acme-v1", "acme-q1"), item("annex-iv-v1", "annex-iv-2a")],
        }),
        { listed: true, origin: "builder", createdBy: "alice" },
      ),
    );
    expect(r).toMatchObject({ ok: true, number: 1, created: true });
    expect(store.calls.filter((c) => c.startsWith("insert"))).toEqual(["insertQuestionnaireVersion"]);
    expect(store.questionnaires.find((x) => x.id === r.questionnaireId)).toMatchObject({
      name: "Acme questionnaire", description: "Ours.", origin: "builder", listed: true, createdBy: "alice", retiredAt: null,
    });
    expect(store.questionnaireVersions.find((v) => v.id === r.versionId)).toMatchObject({
      questionnaireId: r.questionnaireId, number: 1, blocks: ["description", "risks"], createdBy: "alice",
    });
    expect(store.questionnaireItems.filter((i) => i.questionnaireVersionId === r.versionId)).toEqual([
      { questionnaireVersionId: r.versionId, position: 0, setVersionId: "acme-v1", questionId: "acme-q1" },
      { questionnaireVersionId: r.versionId, position: 1, setVersionId: "annex-iv-v1", questionId: "annex-iv-2a" },
    ]);
    expect(setTables()).toBe(before);
  });

  it("T24 wording in a draft item is never read: the pinned set item's wording is what resolves", async () => {
    const r = await saved(
      (await service()).saveDraft(
        draft({ items: [{ setVersionId: "acme-v1", questionId: "acme-q1", text: "Forged?", citation: "x" }] }),
        { listed: true, createdBy: "alice" },
      ),
    );
    const v = await (await service()).resolve(r.versionId);
    expect(v.questions[0]).toMatchObject({ text: "A", citation: "Acme AI Policy §4.2" });
  });

  it("T24 an item that is not a set item is refused: Question <n> no longer exists.", async () => {
    const svc = await service();
    const before = allTables();
    expect(
      await svc.saveDraft(draft({ items: [item("annex-iv-v1", "annex-iv-1a"), item("acme-v1", "annex-iv-1b")] }), {
        listed: true, createdBy: "alice",
      }),
    ).toEqual({ ok: false, error: "Question 2 no longer exists." });
    expect(
      await svc.saveDraft(draft({ items: [item("nope-v1", "acme-q1")] }), { listed: true, createdBy: "alice" }),
    ).toEqual({ ok: false, error: "Question 1 no longer exists." });
    expect(allTables()).toBe(before);
  });

  it("T24 a builtin, unlisted, retired or unknown questionnaire cannot be changed", async () => {
    store
      .addQuestionnaire({ id: "once", name: "Custom questions: MCAS, 2026-09-24", listed: false, versions: [{ items: [] }] })
      .addQuestionnaire({ id: "gone", name: "Gone", retiredAt: new Date("2026-09-20T00:00:00Z"), versions: [{ items: [] }] });
    const svc = await service();
    for (const questionnaireId of ["annex-iv-default", "once", "gone", "unknown"]) {
      const before = allTables();
      const r = await svc.saveDraft(draft(), { questionnaireId, listed: true, createdBy: "bob" });
      expect(r, questionnaireId).toEqual({ ok: false, error: "That questionnaire cannot be changed." });
      expect(allTables(), questionnaireId).toBe(before);
    }
  });

  it("T24 a draft equal to the latest version writes nothing; a change makes the next number", async () => {
    store.addQuestionnaire({
      id: "qn", name: "Q", versions: [{ blocks: ["risks"], items: [item("acme-v1", "acme-q1")] }],
    });
    const svc = await service();
    const same = await svc.saveDraft(draft({ name: "Q", blocks: ["risks"], items: [item("acme-v1", "acme-q1")] }), {
      questionnaireId: "qn", listed: true, createdBy: "bob",
    });
    expect(same).toEqual({ ok: true, questionnaireId: "qn", versionId: "qn-v1", number: 1, created: false });
    expect(store.calls).not.toContain("insertQuestionnaireVersion");
    // T23: the same question pinned to another set version is a change
    const next = await saved(
      svc.saveDraft(draft({ name: "Q", blocks: ["risks"], items: [item("acme-v2", "acme-q1")] }), {
        questionnaireId: "qn", listed: true, createdBy: "bob",
      }),
    );
    expect(next).toMatchObject({ questionnaireId: "qn", number: 2, created: true });
    expect(store.questionnaireVersions.find((v) => v.id === next.versionId)!.createdBy).toBe("bob");
  });

  it("T24 the name of an existing questionnaire is fixed: the draft's name is ignored", async () => {
    store.addQuestionnaire({ id: "qn", name: "Q", versions: [{ items: [item("acme-v1", "acme-q1")] }] });
    const r = await saved(
      (await service()).saveDraft(draft({ name: "Renamed", items: [item("acme-v2", "acme-q1")] }), {
        questionnaireId: "qn", listed: true, createdBy: "bob",
      }),
    );
    expect(r.questionnaireId).toBe("qn");
    expect(store.questionnaires.find((x) => x.id === "qn")!.name).toBe("Q");
  });

  it("T24 P2002 on the version: saved by someone else meanwhile", async () => {
    store.addQuestionnaire({ id: "qn", name: "Q", versions: [{ items: [item("acme-v1", "acme-q1")] }] });
    store.raceOnNextInsert = true;
    const r = await (await service()).saveDraft(draft({ items: [item("acme-v2", "acme-q1")] }), {
      questionnaireId: "qn", listed: true, createdBy: "bob",
    });
    expect(r).toEqual({
      ok: false,
      error: "This questionnaire was saved by someone else meanwhile. Reload it and save again.",
    });
  });

  it("T24 P2002 on a new questionnaire, and a name taken by a listed one ignoring case: already exists", async () => {
    store.nameRaceOnNextInsert = true;
    expect(await (await service()).saveDraft(draft({ name: "Raced" }), { listed: true, createdBy: "bob" })).toEqual({
      ok: false, error: "A questionnaire called Raced already exists.",
    });
    expect(
      await (await service()).saveDraft(draft({ name: "annex IV DEFAULT" }), { listed: true, createdBy: "bob" }),
    ).toEqual({ ok: false, error: "A questionnaire called annex IV DEFAULT already exists." });
  });

  it("T24 names of unlisted and retired questionnaires are not taken for a listed save", async () => {
    store
      .addQuestionnaire({ id: "once", name: "Shared name", listed: false, versions: [{ items: [] }] })
      .addQuestionnaire({ id: "gone", name: "Retired name", retiredAt: new Date("2026-09-20T00:00:00Z"), versions: [{ items: [] }] });
    const svc = await service();
    await saved(svc.saveDraft(draft({ name: "Shared name" }), { listed: true, createdBy: "bob" }));
    await saved(svc.saveDraft(draft({ name: "Retired name" }), { listed: true, createdBy: "bob" }));
  });

  it("T24 A7 zero items is a valid questionnaire; origin is builder unless the save says import", async () => {
    const svc = await service();
    const a = await saved(svc.saveDraft(draft({ name: "Empty", items: [] }), { listed: true, createdBy: "bob" }));
    const b = await saved(svc.saveDraft(draft({ name: "Imp" }), { listed: true, origin: "import", createdBy: "bob" }));
    expect(store.questionnaires.find((x) => x.id === a.questionnaireId)!.origin).toBe("builder");
    expect(store.questionnaires.find((x) => x.id === b.questionnaireId)!.origin).toBe("import");
    expect(store.questionnaireItems.filter((i) => i.questionnaireVersionId === a.versionId)).toEqual([]);
  });

  it("T24 R68 use once: named useOnceFormName(systemName, now, every questionnaire name), unlisted", async () => {
    store
      .addQuestionnaire({ id: "u1", name: "custom questions: mcas, 2026-09-25", listed: false, versions: [{ items: [] }] })
      .addQuestionnaire({ id: "l2", name: "Custom questions: MCAS, 2026-09-25 (2)", versions: [{ items: [] }] });
    const r = await saved(
      (await service()).saveDraft(draft({ name: "Whatever the builder said" }), {
        listed: false, createdBy: "bob", systemName: "MCAS",
      }),
    );
    expect(store.questionnaires.find((x) => x.id === r.questionnaireId)).toMatchObject({
      name: "Custom questions: MCAS, 2026-09-25 (3)", listed: false,
    });
  });

  it("T24 R68 systemName is used only for use once: a listed save keeps the draft's name", async () => {
    const r = await saved(
      (await service()).saveDraft(draft({ name: "Acme questionnaire" }), { listed: true, createdBy: "bob", systemName: "MCAS" }),
    );
    expect(store.questionnaires.find((x) => x.id === r.questionnaireId)!.name).toBe("Acme questionnaire");
  });

  it("T24 an invalid draft is refused with parseQuestionnaireDraft's message", async () => {
    expect(await (await service()).saveDraft(draft({ name: " " }), { listed: true, createdBy: "bob" })).toEqual({
      ok: false, error: "Give the questionnaire a name.",
    });
    expect(
      await (await service()).saveDraft(draft({ blocks: ["colour"] }), { listed: true, createdBy: "bob" }),
    ).toEqual({ ok: false, error: "colour is not a part of the questionnaire." });
  });
});

// ── T25 resolving renders the pinned wording ────────────────────────────────

describe("resolving a questionnaire version renders the pinned wording (T25)", () => {
  beforeEach(() => {
    seedAcme();
    store.addQuestionnaire({ id: "qn", name: "Q", versions: [{ items: [item("acme-v1", "acme-q1")] }] });
  });

  it("T25 R60 Q v1 pinned to S v1 says 'A' with S v1's id and number, though S v2 and v3 reword it", async () => {
    const v = await (await service()).resolve("qn-v1");
    expect(v).toMatchObject({
      questionnaireId: "qn", questionnaireName: "Q", versionId: "qn-v1", versionNumber: 1,
      listed: true, builtin: false, retired: false,
    });
    expect(v.questions).toEqual([
      {
        questionId: "acme-q1",
        scope: "s-acme",
        localId: "q1",
        key: "s-acme:q1",
        field: "q:s-acme:q1",
        text: "A",
        citation: "Acme AI Policy §4.2",
        required: true,
        annexPoint: null,
        groupLabel: null,
        setId: "acme",
        setName: "Acme AI policy",
        setVersionId: "acme-v1",
        setVersionNumber: 1,
        setBuiltin: false,
      },
    ]);
  });

  it("T25 R7 resolve(null) is annexDefaultVersion() without calling the repository", async () => {
    const { annexDefaultVersion } = await loadSrc("domain/forms/legacy.ts");
    const svc = await service();
    store.calls = [];
    expect(await svc.resolve(null)).toEqual(annexDefaultVersion());
    expect(store.calls).toEqual([]);
  });

  it("T25 R7 the seeded default version resolves to the same thing as the in-memory twin", async () => {
    const { annexDefaultVersion } = await loadSrc("domain/forms/legacy.ts");
    expect(await (await service()).resolve("annex-iv-default-v1")).toEqual(annexDefaultVersion());
  });

  it("T25 an unknown id resolves to null", async () => {
    expect(await (await service()).resolve("nope")).toBeNull();
  });

  it("T25 a retired questionnaire's version still resolves, with retired true", async () => {
    store.questionnaires.find((x) => x.id === "qn")!.retiredAt = new Date("2026-09-24T00:00:00Z");
    const v = await (await service()).resolve("qn-v1");
    expect(v).toMatchObject({ retired: true, versionId: "qn-v1" });
    expect(v.questions[0].text).toBe("A");
  });

  it("T25 a mixed version: each question carries its own set's name and version, in item order", async () => {
    store.addQuestionnaire({
      id: "mix", name: "Mix",
      versions: [{ blocks: ["risks", "description"], items: [item("annex-iv-v1", "annex-iv-2a"), item("acme-v3", "acme-q1")] }],
    });
    const v = await (await service()).resolve("mix-v1");
    expect(v.blocks).toEqual(["description", "risks"]);
    expect(v.questions.map((x: { key: string; setName: string; setVersionNumber: number; setBuiltin: boolean; text: string }) => [x.key, x.setName, x.setVersionNumber, x.setBuiltin, x.text])).toEqual([
      ["annex-2:2a", "Annex IV", 1, true, expect.stringMatching(/^How was the system built/)],
      ["s-acme:q1", "Acme AI policy", 3, false, "C"],
    ]);
  });

  it("T25 latestVersion and exportable (06 R57): latest, or the numbered version, for listed, unlisted and builtin", async () => {
    store.addQuestionnaire({
      id: "once", name: "Custom questions: MCAS, 2026-09-24", listed: false,
      versions: [{ items: [item("acme-v1", "acme-q1")] }, { items: [item("acme-v2", "acme-q1")] }],
    });
    const svc = await service();
    expect((await svc.latestVersion("once")).versionId).toBe("once-v2");
    expect((await svc.exportable("once")).versionNumber).toBe(2);
    expect((await svc.exportable("once", 1)).questions[0].text).toBe("A");
    expect((await svc.exportable("annex-iv-default")).versionId).toBe("annex-iv-default-v1");
    expect(await svc.exportable("once", 3)).toBeNull();
    expect(await svc.exportable("nope")).toBeNull();
    expect(await svc.latestVersion("nope")).toBeNull();
  });
});

// ── T35 retiring ────────────────────────────────────────────────────────────

describe("retiring a questionnaire (T35)", () => {
  beforeEach(() => {
    seedAcme();
    store.addQuestionnaire({ id: "qn", name: "Q", versions: [{ items: [item("acme-v1", "acme-q1")] }] });
  });

  it("T35 a retired questionnaire's version still resolves; it leaves the library and the chooser; saves refuse", async () => {
    const svc = await service();
    expect(await svc.retire("qn")).toEqual({ ok: true });
    expect(store.questionnaires.find((x) => x.id === "qn")!.retiredAt).toEqual(NOW);
    expect((await svc.resolve("qn-v1")).questions[0].text).toBe("A");
    expect((await svc.library({ retired: false })).map((r: { questionnaireId: string }) => r.questionnaireId)).toEqual([
      "annex-iv-default",
    ]);
    expect((await svc.chooserOptions()).map((r: { questionnaireId: string }) => r.questionnaireId)).toEqual([
      "annex-iv-default",
    ]);
    expect((await svc.library({ retired: true })).map((r: { questionnaireId: string }) => r.questionnaireId)).toEqual(["qn"]);
    expect(await svc.saveDraft(draft({ items: [item("acme-v2", "acme-q1")] }), { questionnaireId: "qn", listed: true, createdBy: "bob" })).toEqual({
      ok: false, error: "That questionnaire cannot be changed.",
    });
  });

  it("T35 D9 the default cannot be retired; unknown, unlisted or already retired cannot either", async () => {
    store.addQuestionnaire({ id: "once", name: "Custom questions: X, 2026-09-24", listed: false, versions: [{ items: [] }] });
    const svc = await service();
    expect(await svc.retire("annex-iv-default")).toEqual({ ok: false, error: "The Annex IV default cannot be retired." });
    expect(await svc.retire("nope")).toEqual({ ok: false, error: "That questionnaire cannot be retired." });
    expect(await svc.retire("once")).toEqual({ ok: false, error: "That questionnaire cannot be retired." });
    await svc.retire("qn");
    expect(await svc.retire("qn")).toEqual({ ok: false, error: "That questionnaire cannot be retired." });
    expect(store.questionnaires.find((x) => x.id === "annex-iv-default")!.retiredAt).toBeNull();
  });
});

// ── T46 library and chooser ─────────────────────────────────────────────────

describe("library() and chooserOptions() (T46)", () => {
  beforeEach(() => {
    seedAcme();
    store
      .addQuestionnaire({
        id: "zeta", name: "zeta checklist",
        versions: [{ createdBy: "zed", createdAt: new Date("2026-09-21T08:00:00Z"), items: [item("acme-v3", "acme-q1")] }],
      })
      .addQuestionnaire({
        id: "acme-q", name: "Acme questionnaire",
        versions: [
          { createdBy: "alice", items: [item("acme-v3", "acme-q1")] },
          {
            createdBy: "bob",
            createdAt: new Date("2026-09-24T23:59:00Z"),
            blocks: ["risks"],
            // q1 pinned to v1 while v3 rewords it: one update; q2's wording is the same in v3: none
            items: [item("acme-v1", "acme-q1"), item("acme-v1", "acme-q2"), item("annex-iv-v1", "annex-iv-2a")],
          },
        ],
      })
      .addQuestionnaire({ id: "once", name: "Custom questions: MCAS, 2026-09-24", listed: false, versions: [{ items: [] }] })
      .addQuestionnaire({ id: "gone", name: "Beta", retiredAt: new Date("2026-09-22T00:00:00Z"), versions: [{ items: [] }] });
  });

  it("T46 R43 listed, non-retired questionnaires: Annex IV default first (isDefault from the constant), then by name ignoring case", async () => {
    const lib = await (await service()).library({ retired: false });
    expect(lib.map((r: { questionnaireId: string; isDefault: boolean }) => [r.questionnaireId, r.isDefault])).toEqual([
      ["annex-iv-default", true],
      ["acme-q", false],
      ["zeta", false],
    ]);
    for (const q of store.questionnaires) expect(Object.keys(q)).not.toContain("isDefault");
  });

  it("T46 each row carries its latest version, its count, who saved it and when, and the number of updates", async () => {
    const lib = await (await service()).library({ retired: false });
    expect(lib[1]).toEqual({
      questionnaireId: "acme-q",
      name: "Acme questionnaire",
      description: "",
      origin: "builder",
      builtin: false,
      isDefault: false,
      versionId: "acme-q-v2",
      version: 2,
      questionCount: 3,
      savedBy: "bob",
      savedAt: "2026-09-24T23:59:00.000Z",
      retiredAt: null,
      updates: 1,
    });
    expect(lib[0]).toMatchObject({ builtin: true, version: 1, questionCount: 14, savedBy: "system", updates: 0 });
    expect(lib[2]).toMatchObject({ questionnaireId: "zeta", updates: 0, savedAt: "2026-09-21T08:00:00.000Z" });
  });

  it("T46 library({retired: true}) lists only listed retired questionnaires", async () => {
    const lib = await (await service()).library({ retired: true });
    expect(lib.map((r: { questionnaireId: string; retiredAt: string }) => [r.questionnaireId, r.retiredAt])).toEqual([
      ["gone", "2026-09-22T00:00:00.000Z"],
    ]);
  });

  it("T46 R43 chooserOptions() is the library plus every version id, oldest first; exactly one default", async () => {
    const options = await (await service()).chooserOptions();
    expect(options.map((o: { questionnaireId: string; versionIds: string[] }) => [o.questionnaireId, o.versionIds])).toEqual([
      ["annex-iv-default", ["annex-iv-default-v1"]],
      ["acme-q", ["acme-q-v1", "acme-q-v2"]],
      ["zeta", ["zeta-v1"]],
    ]);
    expect(options.filter((o: { isDefault: boolean }) => o.isDefault)).toHaveLength(1);
  });

  it("T46 R43 a store without the builtin rows has no default row at all", async () => {
    store = new FakeQuestionnaireStore();
    store
      .addSet({ id: "acme", name: "Acme AI policy", versions: [{ questions: [{ localId: "q1", text: "A" }] }] })
      .addQuestionnaire({ id: "only", name: "Only", versions: [{ items: [item("acme-v1", "acme-q1")] }] });
    const lib = await (await service()).library({ retired: false });
    expect(lib.map((r: { questionnaireId: string; isDefault: boolean }) => [r.questionnaireId, r.isDefault])).toEqual([["only", false]]);
  });
});

// ── T53 references ──────────────────────────────────────────────────────────

describe("resolving a reference file (T53)", () => {
  beforeEach(() => {
    store.addSet({
      id: "acme",
      name: "Acme AI policy",
      versions: [
        { questions: [{ localId: "q1", text: "A" }] },
        { questions: [{ localId: "q1", text: "B" }, { localId: "q2", text: "Data?" }] },
      ],
    });
  });

  const ref = (setId: string, setVersion: number, scope: string, localId: string, setName = "") => ({
    setId, setName, setVersion, scope, localId,
  });

  it("T53 all found: one pick per item, in item order, pinned to the named set version", async () => {
    const r = await (await service()).resolveReferences([
      ref("annex-iv", 1, "annex-2", "2a", "Annex IV"),
      ref("acme", 1, "s-acme", "q1"),
      ref("acme", 2, "s-acme", "q2"),
    ]);
    expect(r.ok).toBe(true);
    expect(r.picks.map((p: { setVersionId: string; question: { key: string; text: string; setVersionId: string } }) => [p.setVersionId, p.question.key, p.question.text, p.question.setVersionId])).toEqual([
      ["annex-iv-v1", "annex-2:2a", expect.stringMatching(/^How was the system built/), "annex-iv-v1"],
      ["acme-v1", "s-acme:q1", "A", "acme-v1"],
      ["acme-v2", "s-acme:q2", "Data?", "acme-v2"],
    ]);
  });

  it("T53 the spec's example: a missing set version once, a missing question per item", async () => {
    const before = allTables();
    const r = await (await service()).resolveReferences([
      ref("annex-iv", 1, "annex-2", "2a", "Annex IV"),
      ref("acme", 3, "s-acme", "q1", "Acme AI policy"),
      ref("acme", 3, "s-acme", "q2", "Acme AI policy"),
      ref("acme", 1, "s-acme", "q9", "Acme AI policy"),
    ]);
    expect(r).toEqual({
      ok: false,
      missing: [
        'Question set "Acme AI policy" (acme) v3 is not on this install.',
        's-acme:q9 is not in question set "Acme AI policy" v1.',
      ],
    });
    expect(allTables()).toBe(before);
  });

  it("T53 an unknown set with an empty setName is named by its id", async () => {
    const r = await (await service()).resolveReferences([ref("elsewhere", 2, "s-elsewhere", "q1", "")]);
    expect(r).toEqual({ ok: false, missing: ['Question set "elsewhere" (elsewhere) v2 is not on this install.'] });
  });

  it("T53 D15 references match by id and number, never by name", async () => {
    const r = await (await service()).resolveReferences([ref("acme", 1, "s-acme", "q1", "Some other name")]);
    expect(r.ok).toBe(true);
    const byName = await (await service()).resolveReferences([ref("acme-renamed", 1, "s-acme", "q1", "Acme AI policy")]);
    expect(byName.ok).toBe(false);
  });
});

// ── T54 self-contained import ───────────────────────────────────────────────

const selfContained = (over: Record<string, unknown> = {}) => ({
  format: "aisc-questionnaire",
  formatVersion: 1,
  bundle: "self-contained",
  name: "Partner questionnaire",
  description: "From a partner.",
  version: 4,
  blocks: ["description", "risks"],
  items: [
    {
      setId: "annex-iv", setName: "Annex IV", setVersion: 1, scope: "annex-2", localId: "2a",
      text: "How was it built?", citation: "Annex IV(2)(a)", required: true, annexPoint: "2a", groupLabel: "How the system was built",
    },
    {
      setId: "p", setName: "Partner", setVersion: 7, scope: "s-p", localId: "q3",
      text: "Who signs off?", citation: "", required: false, annexPoint: null, groupLabel: null,
    },
  ],
  ...over,
});

describe("importing a self-contained file (T54)", () => {
  it("T54 D16 one transaction: a new set (import) with s-<setId>:q1..qN, its v1 with the file's wording, and a listed questionnaire v1 pinned to it", async () => {
    const r = await (await service()).importSelfContained(selfContained(), {
      setName: "Partner questionnaire questions", questionnaireName: "Partner questionnaire", createdBy: "erin",
    });
    expect(r).toMatchObject({ ok: true });
    expect(store.calls.filter((c) => c.startsWith("insert"))).toHaveLength(1);
    const set = store.sets.find((s) => s.id === r.setId)!;
    expect(set).toMatchObject({ name: "Partner questionnaire questions", origin: "import", createdBy: "erin", retiredAt: null });
    const qs = store.questions.filter((q) => q.setId === r.setId);
    expect(qs.map((q) => [q.scope, q.localId])).toEqual([
      [`s-${r.setId}`, "q1"],
      [`s-${r.setId}`, "q2"],
    ]);
    const sv = store.setVersions.filter((v) => v.setId === r.setId);
    expect(sv).toHaveLength(1);
    expect(sv[0]).toMatchObject({ number: 1, createdBy: "erin" });
    const items = store.setItems.filter((i) => i.setVersionId === sv[0].id).sort((a, b) => a.position - b.position);
    expect(items.map(({ setVersionId: _s, questionId: _q, ...rest }) => rest)).toEqual([
      { position: 0, text: "How was it built?", citation: "Annex IV(2)(a)", required: true, annexPoint: "2a", groupLabel: "How the system was built" },
      { position: 1, text: "Who signs off?", citation: "", required: false, annexPoint: null, groupLabel: null },
    ]);
    const qn = store.questionnaires.find((x) => x.id === r.questionnaireId)!;
    expect(qn).toMatchObject({ name: "Partner questionnaire", origin: "import", listed: true, createdBy: "erin" });
    const qv = store.questionnaireVersions.find((v) => v.id === r.versionId)!;
    expect(qv).toMatchObject({ questionnaireId: qn.id, number: 1, blocks: ["description", "risks"], createdBy: "erin" });
    expect(store.questionnaireItems.filter((i) => i.questionnaireVersionId === r.versionId)).toEqual(
      items.map((i) => ({ questionnaireVersionId: r.versionId, position: i.position, setVersionId: sv[0].id, questionId: i.questionId })),
    );
  });

  it("T54 name errors are T12's and T22's messages, and nothing is written", async () => {
    store.addSet({ id: "x", name: "Taken set", versions: [{ questions: [{ localId: "q1", text: "X?" }] }] });
    const svc = await service();
    const before = allTables();
    expect(await svc.importSelfContained(selfContained(), { setName: "taken SET", questionnaireName: "Fine", createdBy: "erin" })).toEqual({
      ok: false, error: "A question set called taken SET already exists.",
    });
    expect(await svc.importSelfContained(selfContained(), { setName: "Fine", questionnaireName: "Annex IV default", createdBy: "erin" })).toEqual({
      ok: false, error: "A questionnaire called Annex IV default already exists.",
    });
    expect(await svc.importSelfContained(selfContained(), { setName: " ", questionnaireName: "Fine", createdBy: "erin" })).toEqual({
      ok: false, error: "Give the question set a name.",
    });
    expect(await svc.importSelfContained(selfContained(), { setName: "Fine", questionnaireName: "", createdBy: "erin" })).toEqual({
      ok: false, error: "Give the questionnaire a name.",
    });
    expect(allTables()).toBe(before);
  });

  it("T54 round trip: export Q self-contained, import it: same wording, order and blocks; new identities", async () => {
    seedAcme();
    store.addQuestionnaire({
      id: "src", name: "Source",
      versions: [{ blocks: ["targetUsers", "risks"], items: [item("annex-iv-v1", "annex-iv-1a"), item("acme-v2", "acme-q1"), item("acme-v1", "acme-q2")] }],
    });
    const svc = await service();
    const q = await svc.resolve("src-v1");
    const file = selfContained({
      name: q.questionnaireName,
      description: q.description,
      version: q.versionNumber,
      blocks: q.blocks,
      items: q.questions.map((x: Record<string, unknown>) => ({
        setId: x.setId, setName: x.setName, setVersion: x.setVersionNumber, scope: x.scope, localId: x.localId,
        text: x.text, citation: x.citation, required: x.required, annexPoint: x.annexPoint, groupLabel: x.groupLabel,
      })),
    });
    const r = await svc.importSelfContained(file, { setName: "Source questions", questionnaireName: "Source copy", createdBy: "erin" });
    expect(r.ok).toBe(true);
    const back = await svc.resolve(r.versionId);
    const wording = (v: { questions: Record<string, unknown>[] }) =>
      v.questions.map(({ text, citation, required, annexPoint, groupLabel }) => ({ text, citation, required, annexPoint, groupLabel }));
    expect(wording(back)).toEqual(wording(q));
    expect(back.blocks).toEqual(q.blocks);
    expect(back.questionnaireId).not.toBe("src");
    expect(back.questions.every((x: { setId: string }) => x.setId === r.setId)).toBe(true);
    expect(back.questions.map((x: { questionId: string }) => x.questionId)).not.toEqual(q.questions.map((x: { questionId: string }) => x.questionId));
  });
});

// ── T57 history ─────────────────────────────────────────────────────────────

describe("who and when (T57)", () => {
  it("T57 history(id) is every version's stamp, newest first, createdAt ISO 8601 in UTC", async () => {
    store.addQuestionnaire({
      id: "qn", name: "Q",
      versions: [
        { createdBy: "alice", createdAt: new Date("2026-09-20T10:00:00Z"), items: [] },
        { createdBy: "bob", createdAt: new Date("2026-09-24T23:59:00Z"), items: [] },
      ],
    });
    expect(await (await service()).history("qn")).toEqual([
      { versionId: "qn-v2", number: 2, createdAt: "2026-09-24T23:59:00.000Z", createdBy: "bob" },
      { versionId: "qn-v1", number: 1, createdAt: "2026-09-20T10:00:00.000Z", createdBy: "alice" },
    ]);
    expect(await (await service()).history("nope")).toEqual([]);
  });

  it("T57 T55 a save stores its createdBy on the questionnaire and the version", async () => {
    const svc = await service();
    const r = await saved(svc.saveDraft(draft({ name: "Mine" }), { listed: true, createdBy: "dora" }));
    expect((await svc.history(r.questionnaireId))[0]).toMatchObject({ number: 1, createdBy: "dora" });
    expect(store.questionnaires.find((x) => x.id === r.questionnaireId)!.createdBy).toBe("dora");
  });
});

// ── T63 install-wide ────────────────────────────────────────────────────────

describe("questionnaires are install-wide (T63, 06 R47)", () => {
  it("T63 no public method takes a project or projectId parameter; library reads take none at all", async () => {
    const { QuestionnaireService } = await loadSrc(SERVICE);
    const names = Object.getOwnPropertyNames(QuestionnaireService.prototype).filter((n) => n !== "constructor");
    expect(names).toEqual(
      expect.arrayContaining([
        "resolve", "latestVersion", "exportable", "library", "chooserOptions", "history",
        "saveDraft", "retire", "resolveReferences", "importSelfContained",
      ]),
    );
    for (const n of names) {
      const src = String(QuestionnaireService.prototype[n]);
      const params = src.slice(src.indexOf("("), src.indexOf(")") + 1);
      expect(params, n).not.toMatch(/\bproject(Id)?\b/i);
    }
    expect(QuestionnaireService.prototype.chooserOptions.length).toBe(0);
  });

  it("T63 the source does not mention projectId or project_id", () => {
    const text = readFileSync("src/server/services/QuestionnaireService.ts", "utf8");
    expect(text).not.toMatch(/projectId|project_id/);
  });

  it("T63 a questionnaire saved from one project is in every project's library and chooser, and resolves with no project", async () => {
    const r = await saved((await service()).saveDraft(draft({ name: "Shared" }), { listed: true, createdBy: "alice" }));
    const a = await service();
    const b = await service("other");
    expect(await b.library({ retired: false })).toEqual(await a.library({ retired: false }));
    expect(await b.chooserOptions()).toEqual(await a.chooserOptions());
    expect((await b.chooserOptions()).map((o: { questionnaireId: string }) => o.questionnaireId)).toContain(r.questionnaireId);
    expect(await b.resolve(r.versionId)).toMatchObject({ questionnaireId: r.questionnaireId, questionnaireName: "Shared", versionNumber: 1 });
    expect(b.resolve.length).toBe(1);
  });

  it("T24 blocks are stored in FORM_BLOCKS order (all 9 given reversed)", async () => {
    const r = await saved(
      (await service()).saveDraft(draft({ name: "All", blocks: [...ALL_BLOCKS].reverse() }), { listed: true, createdBy: "alice" }),
    );
    expect(store.questionnaireVersions.find((v) => v.id === r.versionId)!.blocks).toEqual([...ALL_BLOCKS]);
  });
});
