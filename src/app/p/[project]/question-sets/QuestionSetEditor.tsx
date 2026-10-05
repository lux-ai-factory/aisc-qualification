"use client";

import { useEffect, useId, useReducer, useRef, useState } from "react";
import {
  ANNEX_POINTS,
  annexCitation,
  isAnnexPoint,
} from "@/domain/forms/annexPoints";
import {
  initialSetEditorState,
  setEditorReducer,
  toSetDraft,
  type QuestionValues,
  type SetEditorInit,
} from "@/domain/forms/setEditorState";
import { saveQuestionSet } from "./actions";

// The question-set editor: where questions are written. Every change is
// one setEditorReducer action (src/domain/forms); this file keeps only what is
// on screen now: the open question editor, the button to focus after a move,
// and the save's error. No blocks and no "Use once": those belong to
// questionnaires.

type Props = {
  project: string;
  initial: SetEditorInit;
  /** The latest version number when editing (defaults to the edited version's). */
  latestNumber?: number;
};

const moveLabel = (text: string, dir: "up" | "down") =>
  `Move ${text.slice(0, 40).trimEnd()} ${dir}`;
const short = (text: string) => text.slice(0, 40).trimEnd();

const NEW_QUESTION: QuestionValues = {
  text: "",
  citation: "",
  required: true,
  annexPoint: null,
};

type Editor = { index: number | null; values: QuestionValues };

export default function QuestionSetEditor({
  project,
  initial,
  latestNumber,
}: Props) {
  const [state, dispatch] = useReducer(
    setEditorReducer,
    initial,
    initialSetEditorState,
  );
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [focus, setFocus] = useState<{
    rowKey: string;
    dir: "up" | "down";
  } | null>(null);
  const moveButtons = useRef(new Map<string, HTMLButtonElement>());
  const dragFrom = useRef<number | null>(null);
  const ids = useId();

  // After a move, the same button of the moved row keeps the focus; at an end,
  // where that button is disabled, the other one takes it.
  useEffect(() => {
    if (!focus) return;
    const other = focus.dir === "up" ? "down" : "up";
    const same = moveButtons.current.get(`${focus.rowKey}:${focus.dir}`);
    const target =
      same && !same.disabled
        ? same
        : moveButtons.current.get(`${focus.rowKey}:${other}`);
    target?.focus();
    setFocus(null);
  }, [focus, state.rows]);

  const editing = initial.edit;
  const latest = latestNumber ?? editing?.versionNumber;

  const move = (index: number, dir: "up" | "down") => {
    const row = state.rows[index];
    dispatch({
      type: "move",
      from: index,
      to: dir === "up" ? index - 1 : index + 1,
    });
    setFocus({ rowKey: row.rowKey, dir });
  };

  const saveQuestion = () => {
    if (!editor || editor.values.text.trim() === "") return;
    if (editor.index === null) dispatch({ type: "add", values: editor.values });
    else dispatch({ type: "edit", index: editor.index, values: editor.values });
    setEditor(null);
  };

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const result = await saveQuestionSet(
        project,
        JSON.stringify(toSetDraft(state)),
        state.setId ?? undefined,
        {
          origin: state.origin,
          alsoQuestionnaire: state.alsoQuestionnaire,
        },
      );
      if (result?.error) setError(result.error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="qualify-form qf-set-editor">
      <section className="qf-section">
        {editing ? (
          <>
            <h2>{state.name}</h2>
            {state.description && (
              <p className="qf-forms-desc">{state.description}</p>
            )}
          </>
        ) : (
          <>
            <div className="field">
              <label className="qf-field-label" htmlFor={`${ids}-name`}>
                Name
              </label>
              <input
                id={`${ids}-name`}
                value={state.name}
                maxLength={120}
                onChange={(e) =>
                  dispatch({ type: "setName", name: e.target.value })
                }
              />
            </div>
            <div className="field">
              <label className="qf-field-label" htmlFor={`${ids}-description`}>
                Description
              </label>
              <textarea
                id={`${ids}-description`}
                value={state.description}
                maxLength={500}
                rows={2}
                onChange={(e) =>
                  dispatch({
                    type: "setDescription",
                    description: e.target.value,
                  })
                }
              />
            </div>
          </>
        )}

        <h3 className="qf-group">Questions ({state.rows.length})</h3>
        {state.rows.length === 0 && (
          <p className="qf-builder-empty">
            No questions yet. Write the first one.
          </p>
        )}
        <ol className="qf-builder-rows">
          {state.rows.map((row, i) => (
            <li
              key={row.rowKey}
              className="qf-builder-row"
              draggable
              onDragStart={() => {
                dragFrom.current = i;
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom.current !== null)
                  dispatch({ type: "move", from: dragFrom.current, to: i });
                dragFrom.current = null;
              }}
            >
              <span className="qf-builder-pos">{i + 1}</span>
              <div className="qf-builder-row-body">
                <span className="qf-question-text">{row.text}</span>
                <div className="qf-builder-chips">
                  {row.citation !== "" && (
                    <span className="qf-citation">{row.citation}</span>
                  )}
                  {row.annexPoint && (
                    <span className="qf-overlap">
                      {annexCitation(row.annexPoint)}
                    </span>
                  )}
                  <span className="qf-tag">
                    {row.required ? "Required" : "Optional"}
                  </span>
                </div>
                <div className="qf-builder-actions">
                  <span className="qf-builder-move">
                    {(["up", "down"] as const).map((dir) => (
                      <button
                        key={dir}
                        type="button"
                        className="qf-builder-tool qf-builder-arrow"
                        aria-label={moveLabel(row.text, dir)}
                        disabled={
                          dir === "up" ? i === 0 : i === state.rows.length - 1
                        }
                        ref={(el) => {
                          const key = `${row.rowKey}:${dir}`;
                          if (el) moveButtons.current.set(key, el);
                          else moveButtons.current.delete(key);
                        }}
                        onClick={() => move(i, dir)}
                      >
                        {dir === "up" ? "↑" : "↓"}
                      </button>
                    ))}
                  </span>
                  <button
                    type="button"
                    className="qf-builder-tool"
                    aria-label={`Edit ${short(row.text)}`}
                    onClick={() =>
                      setEditor({
                        index: i,
                        values: {
                          text: row.text,
                          citation: row.citation,
                          required: row.required,
                          annexPoint: row.annexPoint,
                        },
                      })
                    }
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="qf-builder-tool qf-builder-remove"
                    aria-label={`Remove ${short(row.text)}`}
                    onClick={() => {
                      dispatch({ type: "remove", index: i });
                      setEditor(null);
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>

        {editor ? (
          <div className="qf-builder-editor">
            <h3 className="qf-group">
              {editor.index === null
                ? "New question"
                : `Edit question ${editor.index + 1}`}
            </h3>
            <QuestionEditor
              idPrefix={ids}
              values={editor.values}
              onChange={(values) => setEditor({ ...editor, values })}
              onSave={saveQuestion}
              onCancel={() => setEditor(null)}
            />
          </div>
        ) : (
          <button
            type="button"
            className="btn ghost qf-builder-add"
            onClick={() => setEditor({ index: null, values: NEW_QUESTION })}
          >
            + New question
          </button>
        )}

        {state.origin === "import" && state.setId === null && (
          <label className="qf-builder-check">
            <input
              type="checkbox"
              checked={state.alsoQuestionnaire}
              onChange={() => dispatch({ type: "toggleAlsoQuestionnaire" })}
            />
            Also make a questionnaire with all its questions
          </label>
        )}

        {error && <div className="error">{error}</div>}
        <div className="qf-actions qf-builder-footer">
          <button
            className="btn"
            type="button"
            disabled={saving}
            onClick={submit}
          >
            {editing && latest !== undefined
              ? `Save as v${latest + 1}`
              : "Save question set"}
          </button>
        </div>
      </section>
    </div>
  );
}

/** One question's wording: the text, the citation, whether it is required,
 *  and the Annex IV point it answers. */
function QuestionEditor({
  idPrefix,
  values,
  onChange,
  onSave,
  onCancel,
}: {
  idPrefix: string;
  values: QuestionValues;
  onChange: (values: QuestionValues) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (over: Partial<QuestionValues>) =>
    onChange({ ...values, ...over });
  return (
    <div>
      <div className="field">
        <label className="qf-field-label" htmlFor={`${idPrefix}-text`}>
          Question
        </label>
        <textarea
          id={`${idPrefix}-text`}
          value={values.text}
          required
          maxLength={2000}
          rows={3}
          onChange={(e) => set({ text: e.target.value })}
        />
      </div>
      <div className="qf-builder-editor-pair">
        <div className="field">
          <label className="qf-field-label" htmlFor={`${idPrefix}-citation`}>
            Citation
          </label>
          <input
            id={`${idPrefix}-citation`}
            value={values.citation}
            maxLength={200}
            placeholder="e.g. Acme AI Policy §4.2"
            onChange={(e) => set({ citation: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="qf-field-label" htmlFor={`${idPrefix}-point`}>
            Answers Annex IV point
          </label>
          <select
            id={`${idPrefix}-point`}
            className="qf-select"
            value={values.annexPoint ?? ""}
            onChange={(e) =>
              set({
                annexPoint: isAnnexPoint(e.target.value)
                  ? e.target.value
                  : null,
              })
            }
          >
            <option value="">None</option>
            {ANNEX_POINTS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.citation}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="qf-builder-check">
        <input
          type="checkbox"
          checked={values.required}
          onChange={(e) => set({ required: e.target.checked })}
        />
        Required
      </label>
      <div className="qf-actions qf-builder-editor-actions">
        <button
          type="button"
          className="btn ghost qf-builder-small"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button type="button" className="btn qf-builder-small" onClick={onSave}>
          Save question
        </button>
      </div>
    </div>
  );
}
