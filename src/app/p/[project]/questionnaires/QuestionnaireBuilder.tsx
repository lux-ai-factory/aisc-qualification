"use client";

import Link from "next/link";
import { Fragment, useEffect, useId, useMemo, useReducer, useRef, useState } from "react";
import { METADATA_FIELDS } from "@/data/formFields";
import { RISK_BLOCK } from "@/data/riskFields";
import { FORM_BLOCKS, IDENTITY_FIELDS, type FormBlock } from "@/domain/forms/blocks";
import {
  builderReducer,
  initialBuilderState,
  isTicked,
  toQuestionnaireDraft,
  type BuilderInit,
} from "@/domain/forms/builderState";
import {
  filterLibrary,
  overlapHints,
  overlapLabel,
  updatesAvailable,
  type SetGroup,
} from "@/domain/forms/library";
// useQuestionnaireOnce is a server action, not a hook: renamed so the hook rules do not apply to it.
import { saveQuestionnaire, useQuestionnaireOnce as saveQuestionnaireForOnce } from "./actions";

// The questionnaire builder: the question sets on the left, the
// questionnaire being assembled on the right. A questionnaire only picks
// questions from question-set versions; questions are written in the set
// editor. Every change is one builderReducer action (src/domain/forms); this
// file keeps only what is on screen now: the search text, the button to focus
// after a move, and the save's error.

type Props = {
  project: string;
  /** Every set's latest version, retired ones included (for updates): QuestionSetService.groups(). */
  groups: SetGroup[];
  initial: BuilderInit;
};

const blockLabel = (block: FormBlock) =>
  block === "risks" ? RISK_BLOCK.title : METADATA_FIELDS[block].label;

const short = (text: string) => text.slice(0, 40).trimEnd();
const moveLabel = (text: string, dir: "up" | "down") => `Move ${short(text)} ${dir}`;
const countLabel = (n: number) => `${n} ${n === 1 ? "question" : "questions"}`;

export default function QuestionnaireBuilder({ project, groups, initial }: Props) {
  const [state, dispatch] = useReducer(builderReducer, initial, initialBuilderState);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [focus, setFocus] = useState<{ rowKey: string; dir: "up" | "down" } | null>(null);
  const moveButtons = useRef(new Map<string, HTMLButtonElement>());
  const dragFrom = useRef<number | null>(null);
  const ids = useId();

  // After a move, the same button of the moved row keeps the focus; at an end,
  // where that button is disabled, the other one takes it.
  useEffect(() => {
    if (!focus) return;
    const other = focus.dir === "up" ? "down" : "up";
    const same = moveButtons.current.get(`${focus.rowKey}:${focus.dir}`);
    const target = same && !same.disabled ? same : moveButtons.current.get(`${focus.rowKey}:${other}`);
    target?.focus();
    setFocus(null);
  }, [focus, state.rows]);

  // Retired sets are not offered, but still count for "Update available".
  const offered = useMemo(() => groups.filter((g) => !g.retired), [groups]);
  // The selected sets' groups, in the order they were selected.
  const shownGroups = useMemo(
    () => state.selected.flatMap((id) => offered.filter((g) => g.setId === id)),
    [state.selected, offered],
  );
  const shown = useMemo(() => filterLibrary(shownGroups, search), [shownGroups, search]);
  const hints = useMemo(
    () =>
      overlapHints(
        state.rows.map((r) => ({ questionId: r.questionId, annexPoint: r.source.annexPoint })),
        offered.flatMap((g) => g.questions),
      ),
    [state.rows, offered],
  );
  const updates = useMemo(() => updatesAvailable(state.rows, groups), [state.rows, groups]);
  const anyReworded = Object.values(updates).some((u) => u.kind === "reworded");

  const move = (index: number, dir: "up" | "down") => {
    const row = state.rows[index];
    dispatch({ type: "move", from: index, to: dir === "up" ? index - 1 : index + 1 });
    setFocus({ rowKey: row.rowKey, dir });
  };

  const submit = async (action: "save" | "once") => {
    setError(null);
    setSaving(true);
    try {
      const json = JSON.stringify(toQuestionnaireDraft(state));
      const result =
        action === "save"
          ? await saveQuestionnaire(project, json, state.questionnaireId ?? undefined, state.origin)
          : await saveQuestionnaireForOnce(project, json, state.origin);
      if (result?.error) setError(result.error);
    } finally {
      setSaving(false);
    }
  };

  const editing = initial.edit;

  return (
    <div className="qualify-form qf-builder">
      <section aria-label="Question library" className="qf-section qf-builder-library">
        <div className="qf-builder-toolbar">
          <fieldset className="qf-builder-forms">
            <legend className="qf-field-label">Select question sets</legend>
            <div className="qf-builder-formchips">
              {offered.map((g) => (
                <label key={g.setId} className="qf-builder-formchip">
                  <input
                    type="checkbox"
                    checked={state.selected.includes(g.setId)}
                    onChange={(e) =>
                      dispatch(
                        e.target.checked ? { type: "selectSet", group: g } : { type: "deselectSet", setId: g.setId },
                      )
                    }
                  />
                  <span className="qf-builder-formchip-name">{g.setName}</span>
                  <span className="qf-builder-formchip-meta">
                    {`v${g.versionNumber} · ${countLabel(g.questions.length)}`}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="field">
            <label className="qf-field-label" htmlFor={`${ids}-search`}>
              Search questions
            </label>
            <input id={`${ids}-search`} type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="qf-builder-groups">
          {shownGroups.length === 0 ? (
            <p className="qf-builder-empty qf-builder-prompt">Select one or more question sets to see their questions.</p>
          ) : (
            shown.length === 0 && <p className="qf-builder-empty">No question matches the search.</p>
          )}
          {shownGroups.length > 0 &&
            shown.map((group) => (
              <div key={group.setId} className="qf-builder-group">
                <h3 className="qf-group">{group.setName}</h3>
                <ul className="qf-builder-list">
                  {group.questions.map((q) => (
                    <li key={q.questionId}>
                      <label className="qf-builder-pick">
                        <input
                          type="checkbox"
                          checked={isTicked(state, q.questionId)}
                          onChange={(e) =>
                            dispatch(
                              e.target.checked
                                ? { type: "tick", question: q, setVersionId: group.versionId, group }
                                : { type: "untick", questionId: q.questionId },
                            )
                          }
                        />
                        <span className="qf-builder-pick-body">
                          <span className="qf-question-text">{q.text}</span>
                          {(q.citation !== "" || hints[q.questionId]) && (
                            <span className="qf-builder-chips">
                              {q.citation !== "" && <span className="qf-citation">{q.citation}</span>}
                              {hints[q.questionId] && (
                                <span className="qf-overlap">{overlapLabel(hints[q.questionId])}</span>
                              )}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      </section>

      <section aria-label="Your questionnaire" className="qf-section qf-builder-form">
        {editing ? (
          <h2>{state.name}</h2>
        ) : (
          <div className="field">
            <label className="qf-field-label" htmlFor={`${ids}-name`}>
              Questionnaire name
            </label>
            <input
              id={`${ids}-name`}
              value={state.name}
              maxLength={120}
              onChange={(e) => dispatch({ type: "setName", name: e.target.value })}
            />
          </div>
        )}

        <h3 className="qf-group">Blocks</h3>
        {/* Reads "Always included: System name, Version, Company (provider)";
            the commas are there for a screen reader, the chips show the list. */}
        <p className="qf-builder-identity">
          <span className="qf-builder-identity-label">Always included: </span>
          {IDENTITY_FIELDS.map((id, i) => (
            <Fragment key={id}>
              {i > 0 && <span className="qf-sr">, </span>}
              <span className="qf-builder-locked">{METADATA_FIELDS[id].label}</span>
            </Fragment>
          ))}
        </p>
        <div className="qf-builder-blocks">
          {FORM_BLOCKS.map((block) => (
            <label key={block} className="qf-builder-block">
              <input
                type="checkbox"
                checked={state.blocks.includes(block)}
                onChange={() => dispatch({ type: "toggleBlock", block })}
              />
              {blockLabel(block)}
            </label>
          ))}
        </div>

        <div className="qf-builder-questions-head">
          <h3 className="qf-group">Questions ({state.rows.length})</h3>
          {anyReworded && (
            <button
              type="button"
              className="btn ghost qf-builder-small"
              onClick={() => dispatch({ type: "acceptAllUpdates", updates })}
            >
              Accept all updates
            </button>
          )}
        </div>
        <p className="qf-builder-author">
          Questions are written in question sets.{" "}
          <Link href={`/p/${project}/question-sets/new`}>Write a question set</Link>
        </p>
        {state.rows.length === 0 && (
          <p className="qf-builder-empty">No questions yet. Select a question set in the library.</p>
        )}
        <ol className="qf-builder-rows">
          {state.rows.map((row, i) => {
            const q = row.source;
            const hint = hints[row.questionId];
            const update = updates[i];
            return (
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
                  if (dragFrom.current !== null) dispatch({ type: "move", from: dragFrom.current, to: i });
                  dragFrom.current = null;
                }}
              >
                <span className="qf-builder-pos">{i + 1}</span>
                <div className="qf-builder-row-body">
                  <span className="qf-question-text">{q.text}</span>
                  <div className="qf-builder-chips">
                    {q.citation !== "" && <span className="qf-citation">{q.citation}</span>}
                    <span className="qf-builder-owner">{`${q.setName} v${q.setVersionNumber}`}</span>
                    {hint && <span className="qf-overlap">{overlapLabel(hint)}</span>}
                    <span className="qf-tag">{q.required ? "Required" : "Optional"}</span>
                  </div>
                  {update && (
                    <div className="qf-builder-update">
                      <span className="qf-tag qf-tag--notice">Update available</span>
                      {update.kind === "reworded" ? (
                        <>
                          <p className="qf-new-wording">
                            {`${update.question.setName} v${update.versionNumber} words it: ${update.question.text}`}
                          </p>
                          <button
                            type="button"
                            className="btn ghost qf-builder-small"
                            aria-label={`Accept the update of ${q.text.slice(0, 40)}`}
                            onClick={() =>
                              dispatch({
                                type: "acceptUpdate",
                                index: i,
                                question: update.question,
                                setVersionId: update.versionId,
                              })
                            }
                          >
                            Accept update
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="qf-new-wording">{`Removed from ${update.setName} v${update.versionNumber}.`}</p>
                          <button
                            type="button"
                            className="btn ghost qf-builder-small"
                            aria-label={`Remove ${q.text.slice(0, 40)}`}
                            onClick={() => dispatch({ type: "remove", index: i })}
                          >
                            Remove from questionnaire
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  <div className="qf-builder-actions">
                    <span className="qf-builder-move">
                      {(["up", "down"] as const).map((dir) => (
                        <button
                          key={dir}
                          type="button"
                          className="qf-builder-tool qf-builder-arrow"
                          aria-label={moveLabel(q.text, dir)}
                          disabled={dir === "up" ? i === 0 : i === state.rows.length - 1}
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
                      className="qf-builder-tool qf-builder-remove"
                      onClick={() => dispatch({ type: "remove", index: i })}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        {error && <div className="error">{error}</div>}
        <div className="qf-actions qf-builder-footer">
          <button className="btn ghost" type="button" disabled={saving} onClick={() => submit("once")}>
            Use once
          </button>
          <button className="btn" type="button" disabled={saving} onClick={() => submit("save")}>
            {editing ? `Save as v${editing.versionNumber + 1}` : "Save questionnaire"}
          </button>
        </div>
      </section>
    </div>
  );
}
