import { describe, it, expect, beforeEach } from "vitest";
import {
  FakeQuestionnaireStore,
  idCounter,
} from "../support/fakeQuestionnaireStore";
import { loadSrc } from "../support/forms";

// A question set or questionnaire editor opened on version N posts N as `baseNumber`; the
// service numbers the new version N + 1 and compares the draft with version N. A save from
// a stale editor (someone saved N + 1 meanwhile) then meets the unique (id, number) index,
// which the fake store imitates with a P2002, and is answered with the RACED message; the
// newer version stays the latest, untouched.

const NOW = new Date("2026-10-13T12:00:00.000Z");
const SET_RACED =
  "This question set was saved by someone else meanwhile. Reload it and save again.";
const QN_RACED =
  "This questionnaire was saved by someone else meanwhile. Reload it and save again.";

let store: FakeQuestionnaireStore;

beforeEach(() => {
  store = new FakeQuestionnaireStore().seedAnnex();
  store.addSet({
    id: "acme",
    name: "Acme AI policy",
    versions: [
      { questions: [{ localId: "q1", text: "A" }] },
      { questions: [{ localId: "q1", text: "B" }] },
    ],
  });
});

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

async function sets(): Promise<any> {
  const { QuestionSetService } = await loadSrc(
    "server/services/QuestionSetService.ts",
  );
  return new QuestionSetService(store as never, {
    newId: idCounter("s"),
    now: () => NOW,
  });
}
async function questionnaires(): Promise<any> {
  const { QuestionnaireService } = await loadSrc(
    "server/services/QuestionnaireService.ts",
  );
  return new QuestionnaireService(store as never, {
    newId: idCounter("n"),
    now: () => NOW,
  });
}

const setDraft = (text: string) => ({
  name: "Acme AI policy",
  description: "",
  questions: [
    { questionId: "acme-q1", text, citation: "", required: true, annexPoint: null },
  ],
});

describe("a question set saved from a stale editor", () => {
  it("the second save from base 2 is refused with RACED; v3 keeps the first save's wording", async () => {
    const svc = await sets();
    const first = await svc.saveDraft(setDraft("Reworded by A"), {
      setId: "acme",
      baseNumber: 2,
      createdBy: "alice",
    });
    expect(first).toMatchObject({ ok: true, number: 3, created: true });
    const before = tables();
    const second = await svc.saveDraft(setDraft("Stale from B"), {
      setId: "acme",
      baseNumber: 2,
      createdBy: "bob",
    });
    expect(second).toEqual({ ok: false, error: SET_RACED });
    expect(tables()).toBe(before);
    const latest = await svc.latest("acme");
    expect(latest.versionNumber).toBe(3);
    expect(latest.questions.map((q: { text: string }) => q.text)).toEqual([
      "Reworded by A",
    ]);
  });

  it("the unchanged check is against the base: a draft equal to v1, opened on v1, writes nothing", async () => {
    const svc = await sets();
    const before = tables();
    const r = await svc.saveDraft(setDraft("A"), {
      setId: "acme",
      baseNumber: 1,
      createdBy: "bob",
    });
    expect(r).toEqual({
      ok: true,
      setId: "acme",
      versionId: "acme-v1",
      number: 1,
      created: false,
    });
    expect(tables()).toBe(before);
  });

  it("a draft equal to the latest but opened on an older base is a change against that base, so it is refused", async () => {
    const r = await (await sets()).saveDraft(setDraft("B"), {
      setId: "acme",
      baseNumber: 1,
      createdBy: "bob",
    });
    expect(r).toEqual({ ok: false, error: SET_RACED });
  });

  it("a base the set does not have is refused with RACED and writes nothing", async () => {
    const before = tables();
    const r = await (await sets()).saveDraft(setDraft("X"), {
      setId: "acme",
      baseNumber: 7,
      createdBy: "bob",
    });
    expect(r).toEqual({ ok: false, error: SET_RACED });
    expect(tables()).toBe(before);
  });
});

describe("a questionnaire saved from a stale editor", () => {
  beforeEach(() => {
    store.addQuestionnaire({
      id: "qn",
      name: "Q",
      versions: [
        { items: [{ setVersionId: "acme-v1", questionId: "acme-q1" }] },
        { items: [{ setVersionId: "acme-v2", questionId: "acme-q1" }] },
      ],
    });
  });
  const qnDraft = (setVersionId: string, blocks: string[] = []) => ({
    name: "Q",
    description: "",
    blocks,
    items: [{ setVersionId, questionId: "acme-q1" }],
  });

  it("the second save from base 2 is refused with RACED; v3 keeps the first save", async () => {
    const svc = await questionnaires();
    const first = await svc.saveDraft(qnDraft("acme-v2", ["risks"]), {
      questionnaireId: "qn",
      baseNumber: 2,
      listed: true,
      createdBy: "alice",
    });
    expect(first).toMatchObject({ ok: true, number: 3, created: true });
    const before = tables();
    const second = await svc.saveDraft(qnDraft("acme-v1"), {
      questionnaireId: "qn",
      baseNumber: 2,
      listed: true,
      createdBy: "bob",
    });
    expect(second).toEqual({ ok: false, error: QN_RACED });
    expect(tables()).toBe(before);
    const latest = await svc.latestVersion("qn");
    expect(latest.versionNumber).toBe(3);
    expect(latest.blocks).toEqual(["risks"]);
  });

  it("the unchanged check is against the base: a draft equal to v1, opened on v1, writes nothing", async () => {
    const before = tables();
    const r = await (await questionnaires()).saveDraft(qnDraft("acme-v1"), {
      questionnaireId: "qn",
      baseNumber: 1,
      listed: true,
      createdBy: "bob",
    });
    expect(r).toEqual({
      ok: true,
      questionnaireId: "qn",
      versionId: "qn-v1",
      number: 1,
      created: false,
    });
    expect(tables()).toBe(before);
  });

  it("a base the questionnaire does not have is refused with RACED and writes nothing", async () => {
    const before = tables();
    const r = await (await questionnaires()).saveDraft(qnDraft("acme-v1"), {
      questionnaireId: "qn",
      baseNumber: 9,
      listed: true,
      createdBy: "bob",
    });
    expect(r).toEqual({ ok: false, error: QN_RACED });
    expect(tables()).toBe(before);
  });
});
