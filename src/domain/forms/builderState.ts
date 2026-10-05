// The questionnaire builder's state. Every click is one reducer
// action; QuestionnaireBuilder.tsx only renders this state and dispatches. A
// questionnaire is assembled only by picking questions from question-set versions:
// every row is a pick, and nothing here writes or rewords a question (that is the
// question-set editor, setEditorState.ts). Pure: no React, no network, and the
// reducer never mutates the state it is given.
import { FORM_BLOCKS, inBlockOrder, type FormBlock } from "./blocks";
import type { SetGroup, SetUpdate } from "./library";
import type { QuestionnaireDraft } from "./questionnaireDraft";
import type { ResolvedQuestion, ResolvedQuestionnaireVersion } from "./types";

/**
 * One row of the right column: a question pinned to the set version whose wording
 * it shows. `rowKey` is internal (React keys, focus after a move) and never leaves
 * the builder; `viaSetId` is the selected set this pick came from, so unselecting
 * that set takes it back.
 */
export type BuilderRow = {
  rowKey: string;
  kind: "pick";
  questionId: string;
  setVersionId: string;
  source: ResolvedQuestion;
  viaSetId?: string;
};

export type BuilderState = {
  /** null for a new questionnaire. */
  questionnaireId: string | null;
  name: string;
  description: string;
  blocks: FormBlock[];
  rows: BuilderRow[];
  origin: "builder" | "import";
  /** The sets selected in "Select question sets", in the order they were selected. */
  selected: string[];
  /** The next row key: a counter, so keys stay unique and the reducer stays pure. */
  nextRow: number;
};

export type BuilderAction =
  /** With `group`, the tick is made in that selected set's group. */
  | {
      type: "tick";
      question: ResolvedQuestion;
      setVersionId: string;
      group?: SetGroup;
    }
  | { type: "untick"; questionId: string }
  | { type: "selectSet"; group: SetGroup }
  | { type: "deselectSet"; setId: string }
  | { type: "move"; from: number; to: number }
  | { type: "remove"; index: number }
  | { type: "toggleBlock"; block: FormBlock }
  | { type: "setName"; name: string }
  /** "Accept the update": the pick now shows that set version's wording. */
  | {
      type: "acceptUpdate";
      index: number;
      question: ResolvedQuestion;
      setVersionId: string;
    }
  /** "Accept all updates": every reworded update of `updatesAvailable`; removed ones are left. */
  | { type: "acceptAllUpdates"; updates: Record<number, SetUpdate> };

/** A pick as a caller hands it in: an imported reference, resolved. */
export type BuilderPick = {
  question: ResolvedQuestion;
  setVersionId: string;
  viaSetId?: string;
};

export type BuilderInit = {
  name?: string;
  description?: string;
  blocks?: FormBlock[];
  origin?: "builder" | "import";
  /** An import by reference: its resolved picks, their sets shown as selected. */
  picks?: BuilderPick[];
  /** /questionnaires/new?from=<id>: that questionnaire's picks, pins and blocks. */
  startFrom?: ResolvedQuestionnaireVersion;
  /** /questionnaires/<id>/edit: the questionnaire's latest version, to save the next one. */
  edit?: ResolvedQuestionnaireVersion;
};

type RowInput = Omit<BuilderRow, "rowKey">;

const pick = (
  q: ResolvedQuestion,
  setVersionId: string,
  viaSetId?: string,
): RowInput =>
  viaSetId === undefined
    ? { kind: "pick", questionId: q.questionId, setVersionId, source: q }
    : {
        kind: "pick",
        questionId: q.questionId,
        setVersionId,
        source: q,
        viaSetId,
      };

/** The given picks as rows keyed r0, r1, ..., each marked with its set, and those sets selected. */
function withPicks(base: BuilderState, picks: BuilderPick[]): BuilderState {
  const rows = picks.map((p, i) => ({
    ...pick(p.question, p.setVersionId, p.viaSetId ?? p.question.setId),
    rowKey: `r${i}`,
  }));
  const selected = [...new Set(rows.map((r) => r.viaSetId as string))];
  return { ...base, rows, selected, nextRow: rows.length };
}

const picksOf = (v: ResolvedQuestionnaireVersion): BuilderPick[] =>
  v.questions.map((q) => ({ question: q, setVersionId: q.setVersionId }));

export function initialBuilderState(opts: BuilderInit = {}): BuilderState {
  const base: BuilderState = {
    questionnaireId: null,
    name: opts.name ?? "",
    description: opts.description ?? "",
    // A new questionnaire starts with every block, like the default one.
    blocks: opts.blocks ? inBlockOrder(opts.blocks) : [...FORM_BLOCKS],
    rows: [],
    origin: opts.origin ?? "builder",
    selected: [],
    nextRow: 0,
  };
  if (opts.edit) {
    const v = opts.edit;
    return withPicks(
      {
        ...base,
        questionnaireId: v.questionnaireId,
        name: v.questionnaireName,
        description: v.description,
        blocks: [...v.blocks],
      },
      picksOf(v),
    );
  }
  if (opts.startFrom) {
    return withPicks(
      { ...base, blocks: [...opts.startFrom.blocks] },
      picksOf(opts.startFrom),
    );
  }
  return withPicks(base, opts.picks ?? []);
}

/** Whether a question is in the questionnaire. */
export function isTicked(state: BuilderState, questionId: string): boolean {
  return state.rows.some((r) => r.questionId === questionId);
}

function insertAt(
  state: BuilderState,
  index: number,
  row: RowInput,
): BuilderState {
  const rows = [...state.rows];
  rows.splice(index, 0, { ...row, rowKey: `r${state.nextRow}` });
  return { ...state, rows, nextRow: state.nextRow + 1 };
}

const append = (state: BuilderState, row: RowInput) =>
  insertAt(state, state.rows.length, row);

/**
 * Where a question ticked in set S's group goes: after the last row from S
 * that stands earlier in S's order; else before the first row from S that stands
 * later; else at the end.
 */
function placeIn(
  state: BuilderState,
  group: SetGroup,
  questionId: string,
): number {
  const order = group.questions.map((q) => q.questionId);
  const at = order.indexOf(questionId);
  if (at < 0) return state.rows.length;
  let after = -1;
  let before = -1;
  state.rows.forEach((r, i) => {
    if (r.viaSetId !== group.setId) return;
    const pos = order.indexOf(r.questionId);
    if (pos < 0) return;
    if (pos < at) after = i;
    else if (pos > at && before < 0) before = i;
  });
  if (after >= 0) return after + 1;
  if (before >= 0) return before;
  return state.rows.length;
}

function repinned(
  row: BuilderRow,
  question: ResolvedQuestion,
  setVersionId: string,
): BuilderRow {
  return { ...row, source: question, setVersionId };
}

export function builderReducer(
  state: BuilderState,
  action: BuilderAction,
): BuilderState {
  switch (action.type) {
    case "tick": {
      if (isTicked(state, action.question.questionId)) return state;
      const { group } = action;
      if (!group)
        return append(state, pick(action.question, action.setVersionId));
      return insertAt(
        state,
        placeIn(state, group, action.question.questionId),
        pick(action.question, action.setVersionId, group.setId),
      );
    }
    case "untick":
      return {
        ...state,
        rows: state.rows.filter((r) => r.questionId !== action.questionId),
      };
    case "selectSet": {
      // Every question of the set not already ticked, in its order, after what is
      // there, pinned to the set's latest version.
      const { group } = action;
      if (state.selected.includes(group.setId)) return state;
      let next: BuilderState = {
        ...state,
        selected: [...state.selected, group.setId],
      };
      for (const q of group.questions) {
        if (!isTicked(next, q.questionId))
          next = append(next, pick(q, group.versionId, group.setId));
      }
      return next;
    }
    case "deselectSet":
      // Takes back the picks that came from it; plain ticks stay.
      if (!state.selected.includes(action.setId)) return state;
      return {
        ...state,
        selected: state.selected.filter((id) => id !== action.setId),
        rows: state.rows.filter((r) => r.viaSetId !== action.setId),
      };
    case "move": {
      const { from, to } = action;
      const n = state.rows.length;
      if (from < 0 || from >= n || to < 0 || to >= n || from === to)
        return state;
      const rows = [...state.rows];
      const [row] = rows.splice(from, 1);
      rows.splice(to, 0, row);
      return { ...state, rows };
    }
    case "remove":
      if (!state.rows[action.index]) return state;
      return {
        ...state,
        rows: state.rows.filter((_, i) => i !== action.index),
      };
    case "toggleBlock":
      return {
        ...state,
        blocks: state.blocks.includes(action.block)
          ? state.blocks.filter((b) => b !== action.block)
          : inBlockOrder([...state.blocks, action.block]),
      };
    case "setName":
      return { ...state, name: action.name };
    case "acceptUpdate": {
      const row = state.rows[action.index];
      if (!row) return state;
      const rows = [...state.rows];
      rows[action.index] = repinned(row, action.question, action.setVersionId);
      return { ...state, rows };
    }
    case "acceptAllUpdates": {
      const rows = state.rows.map((row, i) => {
        const u = action.updates[i];
        return u && u.kind === "reworded"
          ? repinned(row, u.question, u.versionId)
          : row;
      });
      return { ...state, rows };
    }
    default:
      // No own questions, no edits, no copies: anything else changes nothing.
      return state;
  }
}

/** The save payload: blocks in FORM_BLOCKS order; no row keys, no selection, no wording. */
export function toQuestionnaireDraft(state: BuilderState): QuestionnaireDraft {
  return {
    name: state.name,
    description: state.description,
    blocks: inBlockOrder(state.blocks),
    items: state.rows.map((r) => ({
      setVersionId: r.setVersionId,
      questionId: r.questionId,
    })),
  };
}
