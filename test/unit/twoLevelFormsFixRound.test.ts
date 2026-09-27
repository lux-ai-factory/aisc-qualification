import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FakeQuestionnaireStore, idCounter } from "../support/fakeQuestionnaireStore";
import { loadSrc } from "../support/forms";

// Two-level forms, fix round for 05-verification.md H4, H8 and H12
// (docs/superpowers/two-level-forms-2026-09-25/).
//
//   H4   importSelfContained re-validates each item's groupLabel on the server (the file comes
//        back from the browser): the T51 message, never a Prisma or CHECK error (500).
//   H8   the old /forms/<id>/export route encodes the project segment of its Location (T62).
//   H12  a retire racing a save, or a second retire racing the first, maps the trigger's error
//        to the existing user message instead of a 500 (T15, T24, T35).
//
// A race is simulated with the in-memory store: the service's read sees the row as it was
// before the other writer, the write then meets the state after it (as the triggers do).

const NOW = new Date("2026-09-25T12:00:00.000Z");
let store: FakeQuestionnaireStore;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function questionnaireService(): Promise<any> {
  const { QuestionnaireService } = await loadSrc("server/services/QuestionnaireService.ts");
  return new QuestionnaireService(store as never, { newId: idCounter("n"), now: () => NOW });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function questionSetService(): Promise<any> {
  const { QuestionSetService } = await loadSrc("server/services/QuestionSetService.ts");
  return new QuestionSetService(store as never, { newId: idCounter("n"), now: () => NOW });
}

const allTables = () =>
  JSON.stringify([
    store.sets, store.setVersions, store.questions, store.setItems,
    store.questionnaires, store.questionnaireVersions, store.questionnaireItems,
  ]);

beforeEach(() => {
  store = new FakeQuestionnaireStore().seedAnnex();
});

// ── H4 ──────────────────────────────────────────────────────────────────────

const wording = (over: Record<string, unknown> = {}) => ({
  setId: "p", setName: "Partner", setVersion: 1, scope: "s-p", localId: "q1",
  text: "Who signs off?", citation: "", required: false, annexPoint: null, groupLabel: null,
  ...over,
});
const fileWith = (second: unknown) => ({
  format: "aisc-questionnaire",
  formatVersion: 1,
  bundle: "self-contained",
  name: "Partner questionnaire",
  description: "",
  blocks: ["risks"],
  items: [wording({ localId: "q1" }), second],
});
const names = { setName: "Partner questions", questionnaireName: "Partner questionnaire", createdBy: "erin" };
const LABEL_REFUSED = "item 2: groupLabel must be text of at most 120 characters or null";

describe("H4 the self-contained import re-validates groupLabel (T51, T54)", () => {
  for (const [label, value] of [
    ["an empty string", ""],
    ["only spaces", "   "],
    ["121 characters", "x".repeat(121)],
    ["500 characters", "x".repeat(500)],
    ["a number", 42],
    ["a boolean", true],
    ["an object", { a: 1 }],
  ] as const) {
    it(`H4 a groupLabel that is ${label} is refused with the T51 message and nothing is written`, async () => {
      const svc = await questionnaireService();
      const before = allTables();
      const r = await svc.importSelfContained(fileWith(wording({ localId: "q2", groupLabel: value })), names);
      expect(r).toEqual({ ok: false, error: LABEL_REFUSED });
      expect(allTables()).toBe(before);
      expect(store.calls.filter((c) => c.startsWith("insert"))).toEqual([]);
    });
  }

  it("H4 an item that is not an object is refused (the T51 message for it), never a TypeError", async () => {
    const svc = await questionnaireService();
    const before = allTables();
    expect(await svc.importSelfContained(fileWith(null), names)).toEqual({ ok: false, error: "item 2 has no setId" });
    expect(await svc.importSelfContained(fileWith("text"), names)).toEqual({ ok: false, error: "item 2 has no setId" });
    expect(allTables()).toBe(before);
  });

  it("H4 a groupLabel of exactly 120 characters, null or absent is accepted and stored as given", async () => {
    const long = "y".repeat(120);
    const { groupLabel: _dropped, ...noLabel } = wording({ localId: "q3" });
    const file = { ...fileWith(wording({ localId: "q2", groupLabel: long })) };
    file.items = [...file.items, noLabel];
    const r = await (await questionnaireService()).importSelfContained(file, names);
    expect(r).toMatchObject({ ok: true });
    const sv = store.setVersions.find((v) => v.setId === r.setId)!;
    const labels = store.setItems
      .filter((i) => i.setVersionId === sv.id)
      .sort((a, b) => a.position - b.position)
      .map((i) => i.groupLabel);
    expect(labels).toEqual([null, long, null]);
  });
});

// ── H8 ──────────────────────────────────────────────────────────────────────

describe("H8 the old export route encodes every segment it interpolates (T62)", () => {
  afterEach(() => vi.unstubAllEnvs());

  async function location(project: string, formId: string) {
    vi.stubEnv("NEXT_BASE_PATH", "");
    const { GET } = await loadSrc("app/p/[project]/forms/[formId]/export/route.ts");
    const res = (await GET(new Request("http://q/x/export?format=csv"), {
      params: Promise.resolve({ project, formId }),
    })) as Response;
    expect(res.status).toBe(308);
    return res.headers.get("location");
  }

  it("H8 a project with characters that need escaping stays escaped in the Location", async () => {
    expect(await location("a b", "acme")).toBe("/p/a%20b/questionnaires/acme/export?format=csv");
    expect(await location("x/../y?z#w", "acme")).toBe("/p/x%2F..%2Fy%3Fz%23w/questionnaires/acme/export?format=csv");
  });

  it("H8 a plain project is unchanged", async () => {
    expect(await location("mcas", "acme")).toBe("/p/mcas/questionnaires/acme/export?format=csv");
  });
});

// ── H12 ─────────────────────────────────────────────────────────────────────

/** Make the store's reads of `id` answer as if retired_at were still NULL (the racing writer's view). */
function staleSet(id: string) {
  const real = store.findSet.bind(store);
  store.findSet = async (x: string) => {
    const row = await real(x);
    return row && x === id ? { ...row, retiredAt: null } : row;
  };
}
function staleQuestionnaire(id: string) {
  const realFind = store.findQuestionnaire.bind(store);
  store.findQuestionnaire = async (x: string) => {
    const row = await realFind(x);
    return row && x === id ? { ...row, retiredAt: null } : row;
  };
  const realList = store.listQuestionnaires.bind(store);
  store.listQuestionnaires = async () => (await realList()).map((q) => (q.id === id ? { ...q, retiredAt: null } : q));
}

describe("H12 a retire racing a save or a retire gives the existing message, not a 500", () => {
  beforeEach(() => {
    store.addSet({ id: "acme", name: "Acme AI policy", versions: [{ questions: [{ localId: "q1", text: "A" }] }] });
    store.addQuestionnaire({ id: "qn", name: "Q", versions: [{ items: [{ setVersionId: "acme-v1", questionId: "acme-q1" }] }] });
  });

  it("H12 T15 a set save that meets a retire committed meanwhile: That question set cannot be changed.", async () => {
    const svc = await questionSetService();
    expect(await svc.retire("acme")).toEqual({ ok: true });
    staleSet("acme");
    const before = allTables();
    const r = await svc.saveDraft(
      { name: "ignored", questions: [{ questionId: "acme-q1", text: "A2", citation: "", required: true, annexPoint: null }] },
      { setId: "acme", createdBy: "bob" },
    );
    expect(r).toEqual({ ok: false, error: "That question set cannot be changed." });
    expect(allTables()).toBe(before);
  });

  it("H12 a second set retire racing the first: That question set cannot be retired.", async () => {
    const svc = await questionSetService();
    expect(await svc.retire("acme")).toEqual({ ok: true });
    staleSet("acme");
    expect(await svc.retire("acme")).toEqual({ ok: false, error: "That question set cannot be retired." });
    expect(store.sets.find((s) => s.id === "acme")!.retiredAt).toEqual(NOW);
  });

  it("H12 T24 a questionnaire save that meets a retire committed meanwhile: That questionnaire cannot be changed.", async () => {
    const svc = await questionnaireService();
    expect(await svc.retire("qn")).toEqual({ ok: true });
    staleQuestionnaire("qn");
    const before = allTables();
    const r = await svc.saveDraft(
      { name: "Q", description: "", blocks: ["risks"], items: [{ setVersionId: "annex-iv-v1", questionId: "annex-iv-2a" }] },
      { questionnaireId: "qn", listed: true, createdBy: "bob" },
    );
    expect(r).toEqual({ ok: false, error: "That questionnaire cannot be changed." });
    expect(allTables()).toBe(before);
  });

  it("H12 T35 a second questionnaire retire racing the first: That questionnaire cannot be retired.", async () => {
    const svc = await questionnaireService();
    expect(await svc.retire("qn")).toEqual({ ok: true });
    staleQuestionnaire("qn");
    expect(await svc.retire("qn")).toEqual({ ok: false, error: "That questionnaire cannot be retired." });
    expect(store.questionnaires.find((q) => q.id === "qn")!.retiredAt).toEqual(NOW);
  });

  it("H12 any other write error is still thrown (only the retire race is mapped)", async () => {
    const svc = await questionSetService();
    store.retireSet = async () => {
      throw new Error("connection reset");
    };
    await expect(svc.retire("acme")).rejects.toThrow("connection reset");
  });
});
