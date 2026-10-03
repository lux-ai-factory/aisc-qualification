import { describe, it, expect } from "vitest";
import { loadSrc, setQuestion, setVersion } from "../support/forms";

// The question-set editor's state. Every click is one reducer action; QuestionSetEditor.tsx
// only renders it.
//
// SetEditorState = { setId, name, description, rows: SetRow[], origin, alsoQuestionnaire, nextRow }
// SetRow = { rowKey, questionId?, text, citation, required, annexPoint, groupLabel }
// Actions: add {values}, edit {index, values},
// move {from, to}, remove {index}, setName {name}, setDescription {description},
// toggleAlsoQuestionnaire.

const mod = () => loadSrc("domain/forms/setEditorState.ts");

const values = (text: string, over: Record<string, unknown> = {}) => ({
  text,
  citation: "",
  required: true,
  annexPoint: null,
  ...over,
});

/** Freeze deeply, so a mutating reducer throws in strict mode. */
function deepFreeze<T>(x: T): T {
  if (x && typeof x === "object") {
    Object.values(x as object).forEach(deepFreeze);
    Object.freeze(x);
  }
  return x;
}

async function withRows(...texts: string[]) {
  const { initialSetEditorState, setEditorReducer } = await mod();
  let s = initialSetEditorState({});
  for (const t of texts) s = setEditorReducer(s, { type: "add", values: values(t) });
  return s;
}

const texts = (s: { rows: { text: string }[] }) => s.rows.map((r) => r.text);

describe("the set editor's initial state (T16)", () => {
  it("T16 a new set: no id, empty name and description, no rows, origin builder, box unticked", async () => {
    const { initialSetEditorState } = await mod();
    expect(initialSetEditorState({})).toEqual({
      setId: null,
      name: "",
      description: "",
      rows: [],
      origin: "builder",
      alsoQuestionnaire: false,
      nextRow: 0,
    });
  });

  it("T16 {edit} opens every question of the set version as a row with its id, wording and group label", async () => {
    const { initialSetEditorState } = await mod();
    const edit = setVersion({
      setId: "acme",
      setName: "Acme AI policy",
      description: "Our policy.",
      versionId: "acme-v2",
      versionNumber: 2,
      questions: [
        setQuestion("acme", "q1", { text: "A", citation: "§1", required: false, annexPoint: "2a" as never, groupLabel: "Oversight" }),
        setQuestion("acme", "q3", { text: "C" }),
      ],
    });
    const s = initialSetEditorState({ edit });
    expect(s.setId).toBe("acme");
    expect(s.name).toBe("Acme AI policy");
    expect(s.description).toBe("Our policy.");
    expect(s.origin).toBe("builder");
    expect(s.rows.map(({ rowKey: _k, ...r }: { rowKey: string }) => r)).toEqual([
      { questionId: "acme-q1", text: "A", citation: "§1", required: false, annexPoint: "2a", groupLabel: "Oversight" },
      { questionId: "acme-q3", text: "C", citation: "", required: true, annexPoint: null, groupLabel: null },
    ]);
    expect(new Set(s.rows.map((r: { rowKey: string }) => r.rowKey)).size).toBe(2);
  });

  it("T16 {rows, name, origin: import} opens imported rows without ids", async () => {
    const { initialSetEditorState } = await mod();
    const s = initialSetEditorState({
      rows: [values("Imported A", { citation: "§9" }), values("Imported B", { required: false })],
      name: "policy",
      origin: "import",
    });
    expect(s.setId).toBeNull();
    expect(s.name).toBe("policy");
    expect(s.origin).toBe("import");
    expect(s.rows).toHaveLength(2);
    for (const r of s.rows) expect(r.questionId).toBeUndefined();
    expect(s.rows.map((r: { groupLabel: unknown }) => r.groupLabel)).toEqual([null, null]);
    expect(texts(s)).toEqual(["Imported A", "Imported B"]);
  });
});

describe("the set editor's actions (T16)", () => {
  it("T16 add appends a row without questionId and with groupLabel null, with a fresh row key", async () => {
    const { setEditorReducer } = await mod();
    const s = await withRows("A");
    const next = setEditorReducer(s, { type: "add", values: values("B", { citation: "§2", annexPoint: "2g" }) });
    expect(texts(next)).toEqual(["A", "B"]);
    const b = next.rows[1];
    expect(b.questionId).toBeUndefined();
    expect(b.groupLabel).toBeNull();
    expect(b).toMatchObject({ text: "B", citation: "§2", required: true, annexPoint: "2g" });
    expect(b.rowKey).not.toBe(next.rows[0].rowKey);
    expect(next.nextRow).toBe(s.nextRow + 1);
  });

  it("T16 edit changes the wording in place and keeps questionId and groupLabel", async () => {
    const { initialSetEditorState, setEditorReducer } = await mod();
    const s = initialSetEditorState({
      edit: setVersion({ questions: [setQuestion("acme", "q1", { text: "A", groupLabel: "Oversight" })] }),
    });
    const next = setEditorReducer(s, {
      type: "edit",
      index: 0,
      values: values("A2", { citation: "§3", required: false, annexPoint: "1a" }),
    });
    expect(next.rows[0]).toEqual({
      rowKey: s.rows[0].rowKey,
      questionId: "acme-q1",
      text: "A2",
      citation: "§3",
      required: false,
      annexPoint: "1a",
      groupLabel: "Oversight",
    });
  });

  it("T16 edit of a row that is not there returns the state unchanged", async () => {
    const { setEditorReducer } = await mod();
    const s = await withRows("A");
    expect(setEditorReducer(s, { type: "edit", index: 5, values: values("X") })).toBe(s);
  });

  it("T16 01 R18 move reorders; out of range or onto itself is a no-op", async () => {
    const { setEditorReducer } = await mod();
    const s = await withRows("A", "B", "C");
    expect(texts(setEditorReducer(s, { type: "move", from: 0, to: 2 }))).toEqual(["B", "C", "A"]);
    expect(texts(setEditorReducer(s, { type: "move", from: 2, to: 1 }))).toEqual(["A", "C", "B"]);
    for (const [from, to] of [[-1, 0], [0, 3], [3, 0], [1, 1]]) {
      expect(setEditorReducer(s, { type: "move", from, to }), `${from}->${to}`).toBe(s);
    }
  });

  it("T16 remove drops one row; an index that is not there is a no-op", async () => {
    const { setEditorReducer } = await mod();
    const s = await withRows("A", "B", "C");
    expect(texts(setEditorReducer(s, { type: "remove", index: 1 }))).toEqual(["A", "C"]);
    expect(setEditorReducer(s, { type: "remove", index: 9 })).toBe(s);
  });

  it("T16 setName, setDescription and toggleAlsoQuestionnaire", async () => {
    const { setEditorReducer } = await mod();
    const s = await withRows("A");
    expect(setEditorReducer(s, { type: "setName", name: "Acme" }).name).toBe("Acme");
    expect(setEditorReducer(s, { type: "setDescription", description: "Ours." }).description).toBe("Ours.");
    const on = setEditorReducer(s, { type: "toggleAlsoQuestionnaire" });
    expect(on.alsoQuestionnaire).toBe(true);
    expect(setEditorReducer(on, { type: "toggleAlsoQuestionnaire" }).alsoQuestionnaire).toBe(false);
  });

  it("T16 the reducer never mutates its input", async () => {
    const { setEditorReducer } = await mod();
    const s = deepFreeze(await withRows("A", "B"));
    const snapshot = JSON.stringify(s);
    const actions = [
      { type: "add", values: values("C") },
      { type: "edit", index: 0, values: values("A2") },
      { type: "move", from: 0, to: 1 },
      { type: "remove", index: 0 },
      { type: "setName", name: "N" },
      { type: "setDescription", description: "D" },
      { type: "toggleAlsoQuestionnaire" },
    ];
    for (const a of actions) {
      expect(() => setEditorReducer(s, a), a.type).not.toThrow();
      expect(setEditorReducer(s, a), a.type).not.toBe(s);
    }
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe("toSetDraft (T16)", () => {
  it("T16 gives {name, description, questions} without row keys or group labels", async () => {
    const { initialSetEditorState, setEditorReducer, toSetDraft } = await mod();
    let s = initialSetEditorState({
      edit: setVersion({
        description: "Ours.",
        questions: [setQuestion("acme", "q1", { text: "A", citation: "§1", groupLabel: "Oversight" })],
      }),
    });
    s = setEditorReducer(s, { type: "add", values: values("B", { required: false, annexPoint: "2d" }) });
    expect(toSetDraft(s)).toEqual({
      name: "Acme AI policy",
      description: "Ours.",
      questions: [
        { questionId: "acme-q1", text: "A", citation: "§1", required: true, annexPoint: null },
        { text: "B", citation: "", required: false, annexPoint: "2d" },
      ],
    });
  });

  it("T16 a new row's draft question has no questionId key at all", async () => {
    const { toSetDraft } = await mod();
    const d = toSetDraft(await withRows("A"));
    expect("questionId" in d.questions[0]).toBe(false);
    expect("rowKey" in d.questions[0]).toBe(false);
    expect("groupLabel" in d.questions[0]).toBe(false);
  });
});
