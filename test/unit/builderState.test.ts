import { describe, it, expect } from "vitest";
import type { BuilderState } from "@/domain/forms/builderState";
import type { SetGroup } from "@/domain/forms/library";
import type { ResolvedQuestion } from "@/domain/forms/types";
import {
  formVersion,
  loadSrc,
  seededQuestion,
  setQuestion,
} from "../support/forms";

// Every click in the questionnaire builder is one reducer action; QuestionnaireBuilder.tsx only
// renders the state.
//
// A questionnaire is assembled only by picking questions from question-set versions. A row is
// only a pick: { rowKey, kind: "pick", questionId, setVersionId, source, viaSetId? }. There is
// no own row, no copy, no "+ New question" and no "Edit" (those live in the question-set editor).
//
// Interface:
//   state: { questionnaireId, name, description, blocks, rows, origin, selected, nextRow }
//   actions: tick {question, setVersionId, group?}, untick {questionId}, selectSet {group},
//     deselectSet {setId}, move {from, to}, remove {index}, toggleBlock {block}, setName {name},
//     acceptUpdate {index, question, setVersionId}, acceptAllUpdates {updates}
//   initialBuilderState({ name?, description?, blocks?, origin?, picks?, startFrom?, edit? })
//   isTicked(state, questionId), toQuestionnaireDraft(state)

const mod = () => loadSrc("domain/forms/builderState.ts");

const acme1 = setQuestion("acme", "q1", {
  text: "Who signs off a model release?",
  citation: "Acme AI Policy §4.2",
});
const acme2 = setQuestion("acme", "q2", {
  text: "How are incidents reported?",
});
const acme3 = setQuestion("acme", "q3", {
  text: "Which datasets are approved?",
});
const annex1a = seededQuestion("1a");
const annex2a = seededQuestion("2a");

const group = (
  over: Partial<SetGroup> & { questions: ResolvedQuestion[] },
): SetGroup =>
  ({
    setId: "acme",
    setName: "Acme AI policy",
    versionId: "acme-v1",
    versionNumber: 1,
    retired: false,
    ...over,
  }) as SetGroup;

const acmeSet = group({ questions: [acme1, acme2, acme3] });
const annexSet = group({
  setId: "annex-iv",
  setName: "Annex IV",
  versionId: "annex-iv-v1",
  questions: [annex1a, annex2a],
});

/** Freeze deeply, so a mutating reducer throws in strict mode. */
function deepFreeze<T>(x: T): T {
  if (x && typeof x === "object") {
    Object.values(x as object).forEach(deepFreeze);
    Object.freeze(x);
  }
  return x;
}

async function b() {
  const m = await mod();
  const act = (state: BuilderState, ...actions: unknown[]) =>
    actions.reduce<BuilderState>(
      (s, a) => m.builderReducer(s, a as never),
      state,
    );
  return { ...m, act };
}

const ids = (s: BuilderState) => s.rows.map((r) => r.questionId);
const items = (d: { items: unknown[] }) => d.items;

describe("ticking questions in the library column (R16, T27)", () => {
  it("T27 R16 a ticked question is appended as a pick pinned to the given set version", async () => {
    const { act, initialBuilderState, toQuestionnaireDraft } = await b();
    const s = act(
      initialBuilderState(),
      { type: "tick", question: acme1, setVersionId: "acme-v1" },
      { type: "tick", question: annex2a, setVersionId: "annex-iv-v1" },
    );
    expect(
      s.rows.map((r: BuilderState["rows"][number]) => [
        r.kind,
        r.questionId,
        r.setVersionId,
      ]),
    ).toEqual([
      ["pick", "acme-q1", "acme-v1"],
      ["pick", "annex-iv-2a", "annex-iv-v1"],
    ]);
    expect(s.rows[0].source).toEqual(acme1);
    expect(items(toQuestionnaireDraft(s))).toEqual([
      { setVersionId: "acme-v1", questionId: "acme-q1" },
      { setVersionId: "annex-iv-v1", questionId: "annex-iv-2a" },
    ]);
  });

  it("T27 R16 unticking removes it", async () => {
    const { act, initialBuilderState, toQuestionnaireDraft } = await b();
    const s = act(
      initialBuilderState(),
      { type: "tick", question: acme1, setVersionId: "acme-v1" },
      { type: "tick", question: acme2, setVersionId: "acme-v1" },
      { type: "untick", questionId: "acme-q1" },
    );
    expect(items(toQuestionnaireDraft(s))).toEqual([
      { setVersionId: "acme-v1", questionId: "acme-q2" },
    ]);
  });

  it("T27 R16 a question already in the questionnaire shows ticked, and is not added twice", async () => {
    const { act, initialBuilderState, isTicked } = await b();
    const s = act(
      initialBuilderState(),
      { type: "tick", question: acme1, setVersionId: "acme-v1" },
      { type: "tick", question: acme1, setVersionId: "acme-v1" },
    );
    expect(s.rows).toHaveLength(1);
    expect(isTicked(s, "acme-q1")).toBe(true);
    expect(isTicked(s, "acme-q2")).toBe(false);
  });
});

describe("selecting question sets (T27, R76)", () => {
  it("T27 R80 a new builder has no set selected", async () => {
    const { initialBuilderState } = await b();
    expect(initialBuilderState().selected).toEqual([]);
  });

  it("T27 R76 selecting ticks every question of the set not yet ticked, in its order, pinned to its latest version, marked viaSetId", async () => {
    const { act, initialBuilderState, isTicked } = await b();
    const s = act(
      initialBuilderState(),
      { type: "selectSet", group: annexSet },
      { type: "selectSet", group: acmeSet },
    );
    expect(s.selected).toEqual(["annex-iv", "acme"]);
    expect(ids(s)).toEqual([
      "annex-iv-1a",
      "annex-iv-2a",
      "acme-q1",
      "acme-q2",
      "acme-q3",
    ]);
    for (const id of ids(s)) expect(isTicked(s, id)).toBe(true);
    expect(
      s.rows.map((r: BuilderState["rows"][number]) => [
        r.viaSetId,
        r.setVersionId,
      ]),
    ).toEqual([
      ["annex-iv", "annex-iv-v1"],
      ["annex-iv", "annex-iv-v1"],
      ["acme", "acme-v1"],
      ["acme", "acme-v1"],
      ["acme", "acme-v1"],
    ]);
  });

  it("T27 R62 selecting pins to the group's versionId, keeping the wording the group holds", async () => {
    const { act, initialBuilderState } = await b();
    const older = setQuestion("acme", "q1", {
      text: "The wording of v4",
      setVersionId: "acme-v4",
      setVersionNumber: 4,
    });
    const s = act(initialBuilderState(), {
      type: "selectSet",
      group: group({
        versionId: "acme-v4",
        versionNumber: 4,
        questions: [older],
      }),
    });
    expect(s.rows[0]).toMatchObject({
      kind: "pick",
      questionId: "acme-q1",
      setVersionId: "acme-v4",
      viaSetId: "acme",
    });
    expect(s.rows[0].source.text).toBe("The wording of v4");
  });

  it("T27 R76 selecting leaves the blocks and the name alone", async () => {
    const { act, initialBuilderState } = await b();
    const s = act(
      initialBuilderState({ blocks: ["description"] }),
      { type: "setName", name: "Mine" },
      { type: "selectSet", group: acmeSet },
    );
    expect(s.blocks).toEqual(["description"]);
    expect(s.name).toBe("Mine");
  });

  it("T27 R76 a question already ticked is not added twice and its row does not move", async () => {
    const { act, initialBuilderState } = await b();
    const s = act(
      initialBuilderState(),
      { type: "tick", question: annex1a, setVersionId: "annex-iv-v1" },
      { type: "tick", question: acme2, setVersionId: "acme-v1" },
      { type: "selectSet", group: acmeSet },
    );
    expect(ids(s)).toEqual(["annex-iv-1a", "acme-q2", "acme-q1", "acme-q3"]);
    expect(s.rows[1].viaSetId).toBeUndefined();
  });

  it("T27 R76 selecting a set already selected changes nothing", async () => {
    const { act, initialBuilderState, builderReducer } = await b();
    const s = act(initialBuilderState(), { type: "selectSet", group: acmeSet });
    expect(s.selected).toEqual(["acme"]);
    expect(builderReducer(s, { type: "selectSet", group: acmeSet })).toBe(s);
  });

  describe("unselecting (R77)", () => {
    it("T27 R77 removes the set's group and every pick with viaSetId = that set; other picks stay", async () => {
      const { act, initialBuilderState } = await b();
      const s = act(
        initialBuilderState(),
        { type: "selectSet", group: annexSet },
        { type: "selectSet", group: acmeSet },
        { type: "deselectSet", setId: "acme" },
      );
      expect(s.selected).toEqual(["annex-iv"]);
      expect(ids(s)).toEqual(["annex-iv-1a", "annex-iv-2a"]);
    });

    it("T27 R77 a plain tick (no group) is not taken back by unselecting", async () => {
      const { act, initialBuilderState } = await b();
      const s = act(
        initialBuilderState(),
        { type: "tick", question: acme3, setVersionId: "acme-v1" },
        { type: "selectSet", group: acmeSet },
        { type: "deselectSet", setId: "acme" },
      );
      expect(ids(s)).toEqual(["acme-q3"]);
    });

    it("T27 R77 unselecting a set that is not selected changes nothing", async () => {
      const { act, initialBuilderState, builderReducer } = await b();
      const s = act(initialBuilderState(), {
        type: "selectSet",
        group: acmeSet,
      });
      expect(s.selected).toEqual(["acme"]);
      expect(builderReducer(s, { type: "deselectSet", setId: "nope" })).toBe(s);
    });
  });

  describe("ticking inside a selected set (R78)", () => {
    it("T27 R78 unticking keeps the set selected", async () => {
      const { act, initialBuilderState } = await b();
      const s = act(
        initialBuilderState(),
        { type: "selectSet", group: acmeSet },
        { type: "untick", questionId: "acme-q2" },
      );
      expect(s.selected).toEqual(["acme"]);
      expect(ids(s)).toEqual(["acme-q1", "acme-q3"]);
    });

    it("T27 R78 re-ticking puts the question back at its place among that set's rows", async () => {
      const { act, initialBuilderState } = await b();
      const s = act(
        initialBuilderState(),
        { type: "selectSet", group: acmeSet },
        { type: "tick", question: annex2a, setVersionId: "annex-iv-v1" },
        { type: "untick", questionId: "acme-q2" },
        {
          type: "tick",
          question: acme2,
          setVersionId: "acme-v1",
          group: acmeSet,
        },
      );
      expect(ids(s)).toEqual(["acme-q1", "acme-q2", "acme-q3", "annex-iv-2a"]);
      expect(s.rows[1]).toMatchObject({
        kind: "pick",
        viaSetId: "acme",
        setVersionId: "acme-v1",
      });
    });

    it("T27 R78 the first of the set's questions goes back before the set's first row", async () => {
      const { act, initialBuilderState } = await b();
      const s = act(
        initialBuilderState(),
        { type: "tick", question: annex2a, setVersionId: "annex-iv-v1" },
        { type: "selectSet", group: acmeSet },
        { type: "untick", questionId: "acme-q1" },
        {
          type: "tick",
          question: acme1,
          setVersionId: "acme-v1",
          group: acmeSet,
        },
      );
      expect(ids(s)).toEqual(["annex-iv-2a", "acme-q1", "acme-q2", "acme-q3"]);
    });

    it("T27 R78 with none of the set's rows left, it goes at the end", async () => {
      const { act, initialBuilderState } = await b();
      const s = act(
        initialBuilderState(),
        { type: "selectSet", group: acmeSet },
        { type: "tick", question: annex2a, setVersionId: "annex-iv-v1" },
        { type: "untick", questionId: "acme-q1" },
        { type: "untick", questionId: "acme-q2" },
        { type: "untick", questionId: "acme-q3" },
        {
          type: "tick",
          question: acme2,
          setVersionId: "acme-v1",
          group: acmeSet,
        },
      );
      expect(ids(s)).toEqual(["annex-iv-2a", "acme-q2"]);
    });

    it("T27 R78 a tick with no group still appends", async () => {
      const { act, initialBuilderState } = await b();
      const s = act(
        initialBuilderState(),
        { type: "selectSet", group: acmeSet },
        { type: "untick", questionId: "acme-q1" },
        { type: "tick", question: acme1, setVersionId: "acme-v1" },
      );
      expect(ids(s)).toEqual(["acme-q2", "acme-q3", "acme-q1"]);
    });
  });
});

describe("picks only (T28)", () => {
  it("T28 there is no addOwn, edit or copy action: each returns the state unchanged", async () => {
    const { act, initialBuilderState, builderReducer } = await b();
    const s = act(initialBuilderState(), { type: "selectSet", group: acmeSet });
    const v = { text: "Mine?", citation: "", required: true, annexPoint: null };
    for (const a of [
      { type: "addOwn", values: v },
      { type: "edit", index: 0, values: v },
      { type: "copy", index: 0 },
    ]) {
      expect(builderReducer(s, a as never), a.type).toBe(s);
    }
  });

  it("T28 every row is a pick with exactly rowKey, kind, questionId, setVersionId, source and (from a set) viaSetId", async () => {
    const { act, initialBuilderState } = await b();
    const s = act(
      initialBuilderState(),
      { type: "selectSet", group: acmeSet },
      { type: "tick", question: annex2a, setVersionId: "annex-iv-v1" },
    );
    for (const r of s.rows) {
      expect(r.kind).toBe("pick");
      expect(Object.keys(r).sort()).toEqual(
        (r.viaSetId === undefined
          ? ["kind", "questionId", "rowKey", "setVersionId", "source"]
          : [
              "kind",
              "questionId",
              "rowKey",
              "setVersionId",
              "source",
              "viaSetId",
            ]
        ).sort(),
      );
    }
  });
});

describe("reordering and removing (R18)", () => {
  const three = async () => {
    const { act, initialBuilderState } = await b();
    return act(
      initialBuilderState(),
      { type: "tick", question: acme1, setVersionId: "acme-v1" },
      { type: "tick", question: acme2, setVersionId: "acme-v1" },
      { type: "tick", question: annex2a, setVersionId: "annex-iv-v1" },
    );
  };

  it("T28 R18 move(from, to) moves one row", async () => {
    const { act } = await b();
    expect(ids(act(await three(), { type: "move", from: 2, to: 0 }))).toEqual([
      "annex-iv-2a",
      "acme-q1",
      "acme-q2",
    ]);
    expect(ids(act(await three(), { type: "move", from: 0, to: 1 }))).toEqual([
      "acme-q2",
      "acme-q1",
      "annex-iv-2a",
    ]);
  });

  it("T28 R18 moving past either end changes nothing", async () => {
    const { act } = await b();
    const s = await three();
    expect(ids(act(s, { type: "move", from: 0, to: -1 }))).toEqual(ids(s));
    expect(ids(act(s, { type: "move", from: 2, to: 3 }))).toEqual(ids(s));
  });

  it("T28 remove drops the row; an index that is not there changes nothing", async () => {
    const { act, builderReducer } = await b();
    const s = await three();
    expect(ids(act(s, { type: "remove", index: 0 }))).toEqual([
      "acme-q2",
      "annex-iv-2a",
    ]);
    expect(builderReducer(s, { type: "remove", index: 7 })).toBe(s);
  });
});

describe("blocks and the name (R21, T28)", () => {
  it("T28 R21 toggling a block adds or removes it; the draft lists blocks in FORM_BLOCKS order", async () => {
    const { act, initialBuilderState, toQuestionnaireDraft } = await b();
    const s = act(
      initialBuilderState({ blocks: [] }),
      { type: "toggleBlock", block: "risks" },
      { type: "toggleBlock", block: "description" },
      { type: "toggleBlock", block: "sectorTags" },
      { type: "toggleBlock", block: "sectorTags" },
    );
    expect(toQuestionnaireDraft(s).blocks).toEqual(["description", "risks"]);
  });

  it("T28 the name travels in the draft", async () => {
    const { act, initialBuilderState, toQuestionnaireDraft } = await b();
    const s = act(initialBuilderState(), {
      type: "setName",
      name: "Acme AI policy",
    });
    expect(toQuestionnaireDraft(s)).toMatchObject({
      name: "Acme AI policy",
      items: [],
    });
  });
});

describe('"Update available" and accepting it (T29)', () => {
  const newer = setQuestion("acme", "q1", {
    text: "Who approves a model release?",
    citation: "Acme AI Policy §4.3",
    setVersionId: "acme-v2",
    setVersionNumber: 2,
  });
  const newer2 = setQuestion("acme", "q2", {
    text: "How are incidents reported, and to whom?",
    setVersionId: "acme-v2",
    setVersionNumber: 2,
  });

  it("T29 acceptUpdate makes the row's source the new question and its setVersionId the new version", async () => {
    const { act, initialBuilderState, toQuestionnaireDraft } = await b();
    const s = act(
      initialBuilderState(),
      { type: "tick", question: acme2, setVersionId: "acme-v1" },
      { type: "tick", question: acme1, setVersionId: "acme-v1" },
      {
        type: "acceptUpdate",
        index: 1,
        question: newer,
        setVersionId: "acme-v2",
      },
    );
    expect(s.rows[1]).toMatchObject({
      kind: "pick",
      questionId: "acme-q1",
      setVersionId: "acme-v2",
      source: newer,
    });
    expect(s.rows[0]).toMatchObject({ setVersionId: "acme-v1", source: acme2 });
    expect(items(toQuestionnaireDraft(s))[1]).toEqual({
      setVersionId: "acme-v2",
      questionId: "acme-q1",
    });
  });

  it("T29 acceptUpdate keeps the row key and viaSetId", async () => {
    const { act, initialBuilderState } = await b();
    const s = act(initialBuilderState(), { type: "selectSet", group: acmeSet });
    const after = act(s, {
      type: "acceptUpdate",
      index: 0,
      question: newer,
      setVersionId: "acme-v2",
    });
    expect(after.rows[0].rowKey).toBe(s.rows[0].rowKey);
    expect(after.rows[0].viaSetId).toBe("acme");
  });

  it("T29 on a row that is not there, acceptUpdate returns the state unchanged", async () => {
    const { act, initialBuilderState, builderReducer } = await b();
    const s = act(initialBuilderState(), {
      type: "tick",
      question: acme1,
      setVersionId: "acme-v1",
    });
    for (const index of [-1, 1, 5]) {
      expect(
        builderReducer(s, {
          type: "acceptUpdate",
          index,
          question: newer,
          setVersionId: "acme-v2",
        }),
      ).toBe(s);
    }
  });

  it("T29 acceptAllUpdates accepts every reworded update in one action; removed ones stay", async () => {
    const { act, initialBuilderState } = await b();
    const s = act(initialBuilderState(), { type: "selectSet", group: acmeSet });
    const updates = {
      0: {
        kind: "reworded",
        question: newer,
        versionId: "acme-v2",
        versionNumber: 2,
      },
      1: {
        kind: "reworded",
        question: newer2,
        versionId: "acme-v2",
        versionNumber: 2,
      },
      2: { kind: "removed", setName: "Acme AI policy", versionNumber: 2 },
    };
    const after = act(s, { type: "acceptAllUpdates", updates });
    expect(
      after.rows.map((r: BuilderState["rows"][number]) => [
        r.questionId,
        r.setVersionId,
        r.source.text,
      ]),
    ).toEqual([
      ["acme-q1", "acme-v2", "Who approves a model release?"],
      ["acme-q2", "acme-v2", "How are incidents reported, and to whom?"],
      ["acme-q3", "acme-v1", "Which datasets are approved?"],
    ]);
  });

  it("T29 acceptUpdate and acceptAllUpdates never mutate the state they are given", async () => {
    const { act, initialBuilderState, builderReducer } = await b();
    const s = deepFreeze(
      act(initialBuilderState(), { type: "selectSet", group: acmeSet }),
    );
    expect(s.rows).toHaveLength(3);
    const before = JSON.stringify(s);
    expect(
      builderReducer(s, {
        type: "acceptUpdate",
        index: 0,
        question: newer,
        setVersionId: "acme-v2",
      }).rows[0].setVersionId,
    ).toBe("acme-v2");
    expect(() =>
      builderReducer(s, {
        type: "acceptAllUpdates",
        updates: {
          0: {
            kind: "reworded",
            question: newer,
            versionId: "acme-v2",
            versionNumber: 2,
          },
        },
      }),
    ).not.toThrow();
    expect(JSON.stringify(s)).toBe(before);
  });

  it("T29 after accepting, the draft differs from the version it was opened on (the pin changed)", async () => {
    const { initialBuilderState, builderReducer, toQuestionnaireDraft } =
      await b();
    const q = formVersion({
      questionnaireId: "qq",
      versionId: "qq-v1",
      questions: [acme1],
    });
    const s = initialBuilderState({ edit: q });
    const after = builderReducer(s, {
      type: "acceptUpdate",
      index: 0,
      question: newer,
      setVersionId: "acme-v2",
    });
    expect(items(toQuestionnaireDraft(s))).toEqual([
      { setVersionId: "acme-v1", questionId: "acme-q1" },
    ]);
    expect(items(toQuestionnaireDraft(after))).toEqual([
      { setVersionId: "acme-v2", questionId: "acme-q1" },
    ]);
  });
});

describe("where the builder opens (T31, R79)", () => {
  // Q v3 picks acme q1 from acme v1 (an older set version), Annex IV 2a, and acme q2 from acme v2.
  const q = formVersion({
    questionnaireId: "qq",
    questionnaireName: "Questionnaire Q",
    versionId: "qq-v3",
    versionNumber: 3,
    blocks: ["risks"] as never,
    questions: [
      setQuestion("acme", "q1", { setVersionId: "acme-v1" }),
      annex2a,
      setQuestion("acme", "q2", {
        setVersionId: "acme-v2",
        setVersionNumber: 2,
      }),
    ],
  });

  it("T31 /questionnaires/new: nothing selected, no rows, all 9 blocks, origin builder, no id", async () => {
    const { initialBuilderState } = await b();
    const s = initialBuilderState();
    expect(s).toMatchObject({
      questionnaireId: null,
      name: "",
      rows: [],
      selected: [],
      origin: "builder",
    });
    expect(s.blocks).toHaveLength(9);
  });

  it("T31 R79 ?from=<Q>: Q's items as picks pinned to the same set versions (never re-pinned), Q's blocks, the sets selected in first appearance order", async () => {
    const { initialBuilderState, toQuestionnaireDraft } = await b();
    const s = initialBuilderState({ startFrom: q });
    expect(s.questionnaireId).toBeNull();
    expect(s.name).toBe("");
    expect(s.blocks).toEqual(["risks"]);
    expect(s.selected).toEqual(["acme", "annex-iv"]);
    expect(s.rows.map((r: BuilderState["rows"][number]) => r.viaSetId)).toEqual(
      ["acme", "annex-iv", "acme"],
    );
    expect(items(toQuestionnaireDraft(s))).toEqual([
      { setVersionId: "acme-v1", questionId: "acme-q1" },
      { setVersionId: "annex-iv-v1", questionId: "annex-iv-2a" },
      { setVersionId: "acme-v2", questionId: "acme-q2" },
    ]);
  });

  it("T31 /questionnaires/<Q>/edit: the same rows, selection and blocks, with Q's id and name", async () => {
    const { initialBuilderState, toQuestionnaireDraft } = await b();
    const s = initialBuilderState({ edit: q });
    expect(s.questionnaireId).toBe("qq");
    expect(s.name).toBe("Questionnaire Q");
    expect(s.blocks).toEqual(["risks"]);
    expect(s.selected).toEqual(["acme", "annex-iv"]);
    expect(items(toQuestionnaireDraft(s))).toEqual([
      { setVersionId: "acme-v1", questionId: "acme-q1" },
      { setVersionId: "annex-iv-v1", questionId: "annex-iv-2a" },
      { setVersionId: "acme-v2", questionId: "acme-q2" },
    ]);
    expect(s.rows[0].source).toEqual(q.questions[0]);
  });

  it("T31 R79 unselecting a set of the edited questionnaire takes its picks back", async () => {
    const { initialBuilderState, builderReducer } = await b();
    const s = builderReducer(initialBuilderState({ edit: q }), {
      type: "deselectSet",
      setId: "acme",
    });
    expect(ids(s)).toEqual(["annex-iv-2a"]);
    expect(s.selected).toEqual(["annex-iv"]);
  });

  it("T31 an import by reference opens with the resolved picks, their sets selected, the file's blocks and name, origin import", async () => {
    const { initialBuilderState, toQuestionnaireDraft } = await b();
    const s = initialBuilderState({
      name: "Imported Q",
      blocks: ["description"],
      origin: "import",
      picks: [
        { question: annex2a, setVersionId: "annex-iv-v1" },
        { question: acme1, setVersionId: "acme-v1" },
      ],
    });
    expect(s).toMatchObject({
      name: "Imported Q",
      origin: "import",
      questionnaireId: null,
    });
    expect(s.blocks).toEqual(["description"]);
    expect(s.selected).toEqual(["annex-iv", "acme"]);
    expect(s.rows.map((r: BuilderState["rows"][number]) => r.viaSetId)).toEqual(
      ["annex-iv", "acme"],
    );
    expect(items(toQuestionnaireDraft(s))).toEqual([
      { setVersionId: "annex-iv-v1", questionId: "annex-iv-2a" },
      { setVersionId: "acme-v1", questionId: "acme-q1" },
    ]);
  });
});

describe("the state stays pure and thin (T33)", () => {
  it("T33 toQuestionnaireDraft gives exactly {name, description, blocks, items}; selected, viaSetId and row keys do not travel", async () => {
    const { act, initialBuilderState, toQuestionnaireDraft } = await b();
    const s = act(
      initialBuilderState({ blocks: ["risks", "description"] }),
      { type: "setName", name: "N" },
      { type: "selectSet", group: acmeSet },
    );
    const d = toQuestionnaireDraft(s);
    expect(Object.keys(d).sort()).toEqual([
      "blocks",
      "description",
      "items",
      "name",
    ]);
    expect(d.blocks).toEqual(["description", "risks"]);
    for (const it of d.items)
      expect(Object.keys(it).sort()).toEqual(["questionId", "setVersionId"]);
  });

  it("T33 the state has exactly the fields of the spec", async () => {
    const { initialBuilderState } = await b();
    expect(Object.keys(initialBuilderState()).sort()).toEqual(
      [
        "blocks",
        "description",
        "name",
        "nextRow",
        "origin",
        "questionnaireId",
        "rows",
        "selected",
      ].sort(),
    );
  });

  it("T33 every action returns a new state and never mutates its input (deep-frozen)", async () => {
    const { act, initialBuilderState, builderReducer } = await b();
    const s = deepFreeze(
      act(
        initialBuilderState(),
        { type: "selectSet", group: acmeSet },
        { type: "tick", question: annex2a, setVersionId: "annex-iv-v1" },
      ),
    );
    const before = JSON.stringify(s);
    const actions = [
      {
        type: "tick",
        question: annex1a,
        setVersionId: "annex-iv-v1",
        group: annexSet,
      },
      { type: "tick", question: annex1a, setVersionId: "annex-iv-v1" },
      { type: "untick", questionId: "acme-q1" },
      { type: "selectSet", group: annexSet },
      { type: "deselectSet", setId: "acme" },
      { type: "move", from: 0, to: 2 },
      { type: "remove", index: 1 },
      { type: "toggleBlock", block: "risks" },
      { type: "setName", name: "Other" },
      {
        type: "acceptUpdate",
        index: 0,
        question: acme1,
        setVersionId: "acme-v9",
      },
      {
        type: "acceptAllUpdates",
        updates: {
          0: {
            kind: "reworded",
            question: acme1,
            versionId: "acme-v9",
            versionNumber: 9,
          },
        },
      },
    ];
    for (const a of actions) {
      let next: BuilderState | undefined;
      expect(
        () => (next = builderReducer(s, a as never)),
        a.type,
      ).not.toThrow();
      expect(next, a.type).not.toBe(s);
    }
    expect(JSON.stringify(s)).toBe(before);
  });
});
