// The question-set editor's state. Every click is one reducer action;
// QuestionSetEditor.tsx only renders this state and dispatches. Pure: no React, no
// network, and the reducer never mutates the state it is given.
import type { AnnexPointId } from "./annexPoints";
import type { SetDraft, SetDraftQuestion } from "./questionSetDraft";
import type { ResolvedSetVersion } from "./types";

/** What the question editor edits. */
export type QuestionValues = {
  text: string;
  citation: string;
  required: boolean;
  annexPoint: AnnexPointId | null;
};

/**
 * One question row. `rowKey` is internal (React keys, focus after a move) and never
 * leaves the editor; `questionId` is absent for a question this save creates;
 * `groupLabel` is kept from the set version and not edited here.
 */
export type SetRow = {
  rowKey: string;
  questionId?: string;
  groupLabel: string | null;
} & QuestionValues;

export type SetEditorState = {
  /** null for a new set. */
  setId: string | null;
  name: string;
  description: string;
  rows: SetRow[];
  origin: "builder" | "import";
  /** "Also make a questionnaire with all its questions". */
  alsoQuestionnaire: boolean;
  /** The next row key: a counter, so keys stay unique and the reducer stays pure. */
  nextRow: number;
};

export type SetEditorAction =
  | { type: "add"; values: QuestionValues }
  | { type: "edit"; index: number; values: QuestionValues }
  | { type: "move"; from: number; to: number }
  | { type: "remove"; index: number }
  | { type: "setName"; name: string }
  | { type: "setDescription"; description: string }
  | { type: "toggleAlsoQuestionnaire" };

export type SetEditorInit = {
  /** /question-sets/<id>/edit: the set's latest version, to save the next one. */
  edit?: ResolvedSetVersion;
  /** An import: the rows read from the file, without ids. */
  rows?: QuestionValues[];
  name?: string;
  description?: string;
  origin?: "builder" | "import";
};

const wording = (v: QuestionValues): QuestionValues => ({
  text: v.text,
  citation: v.citation,
  required: v.required,
  annexPoint: v.annexPoint,
});

export function initialSetEditorState(init: SetEditorInit = {}): SetEditorState {
  if (init.edit) {
    const set = init.edit;
    const rows: SetRow[] = set.questions.map((q, i) => ({
      rowKey: `r${i}`,
      questionId: q.questionId,
      ...wording(q),
      groupLabel: q.groupLabel,
    }));
    return {
      setId: set.setId,
      name: set.setName,
      description: set.description,
      rows,
      origin: "builder",
      alsoQuestionnaire: false,
      nextRow: rows.length,
    };
  }
  const rows: SetRow[] = (init.rows ?? []).map((v, i) => ({ rowKey: `r${i}`, ...wording(v), groupLabel: null }));
  return {
    setId: null,
    name: init.name ?? "",
    description: init.description ?? "",
    rows,
    origin: init.origin ?? "builder",
    alsoQuestionnaire: false,
    nextRow: rows.length,
  };
}

export function setEditorReducer(state: SetEditorState, action: SetEditorAction): SetEditorState {
  switch (action.type) {
    case "add":
      return {
        ...state,
        rows: [...state.rows, { rowKey: `r${state.nextRow}`, ...wording(action.values), groupLabel: null }],
        nextRow: state.nextRow + 1,
      };
    case "edit": {
      const row = state.rows[action.index];
      if (!row) return state;
      const rows = [...state.rows];
      rows[action.index] = { ...row, ...wording(action.values) };
      return { ...state, rows };
    }
    case "move": {
      const { from, to } = action;
      const n = state.rows.length;
      if (from < 0 || from >= n || to < 0 || to >= n || from === to) return state;
      const rows = [...state.rows];
      const [row] = rows.splice(from, 1);
      rows.splice(to, 0, row);
      return { ...state, rows };
    }
    case "remove":
      if (!state.rows[action.index]) return state;
      return { ...state, rows: state.rows.filter((_, i) => i !== action.index) };
    case "setName":
      return { ...state, name: action.name };
    case "setDescription":
      return { ...state, description: action.description };
    case "toggleAlsoQuestionnaire":
      return { ...state, alsoQuestionnaire: !state.alsoQuestionnaire };
    default:
      return state;
  }
}

/** The save payload: no row keys, no group labels; a new row has no questionId key. */
export function toSetDraft(state: SetEditorState): SetDraft {
  return {
    name: state.name,
    description: state.description,
    questions: state.rows.map((r): SetDraftQuestion =>
      r.questionId === undefined ? wording(r) : { questionId: r.questionId, ...wording(r) },
    ),
  };
}
