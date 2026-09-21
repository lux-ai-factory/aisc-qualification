"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { OntologyNode } from "@/domain/OntologyView";
import type { NodeChange } from "./NodeChip";

// One editor for the whole card, shown as a pop-up so it is never clipped by a
// node or short of room for the full source text.
//
// Portalled to document.body: `position: fixed` is measured against the nearest
// transformed or filtered ancestor, and the graph section is full-bleed, so the
// dialog has to sit outside that subtree for the backdrop to cover the screen.
export default function NodeEditor({
  node,
  vocabularies,
  pending,
  onCancel,
  onSave,
}: {
  node: OntologyNode;
  vocabularies: Record<string, string[]>;
  pending: boolean;
  onCancel: () => void;
  onSave: (change: NodeChange) => void;
}) {
  const [label, setLabel] = useState(node.label);
  const [vair, setVair] = useState(node.vair ?? "");
  const [note, setNote] = useState(node.reviewNote ?? "");
  const [notApplicable, setNotApplicable] = useState(
    Boolean(node.termNotApplicable),
  );

  const terms = (node.cls && vocabularies[node.cls]) || [];
  // Whether the class has any terms at all, versus whether this node should
  // still be offered them: a node marked not-applicable keeps the checkbox so
  // it can be cleared, but the dropdown is disabled.
  const hasTerms = terms.length > 0;
  const typeable = hasTerms;
  // The class has terms, but they name a different population: AIOperator's are
  // all Annex III public bodies. Such a node is not flagged for a missing term,
  // so there is nothing for the "none applies" mark to silence. The list stays,
  // because a deployer that is an authority should carry its term.
  const partialVocabulary = hasTerms && node.termExpected === false;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const dialog = (
    <div className="onto-backdrop" onClick={onCancel}>
      <div
        className="onto-popover"
        role="dialog"
        aria-label={`Edit ${node.label}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <span className="onto-popover-cls">{node.cls}</span>
          {node.vair && <span className="onto-vair">{node.vair}</span>}
          {node.provenance === "reviewed" && (
            <span className="onto-badge">reviewed</span>
          )}
          {node.derivedFrom && (
            <span className="onto-popover-src">from {node.derivedFrom}</span>
          )}
        </header>

        {(node.flags ?? []).length > 0 && (
          <section className="onto-popover-flags">
            <h4>The draft&rsquo;s own review flagged this</h4>
            <ul>
              {(node.flags ?? []).map((flag) => (
                <li key={flag}>
                  <span className="onto-flag">{flag}</span>
                </li>
              ))}
            </ul>
            <p>Saving any change here records that you looked, and clears them.</p>
          </section>
        )}

        <label>
          Name
          <input
            name="label"
            value={label}
            maxLength={60}
            autoFocus
            onChange={(e) => setLabel(e.target.value)}
          />
          <span className="onto-count">{label.length}/60</span>
        </label>

        {typeable ? (
          <>
            <label>
              Vocabulary term
              <select
                value={vair}
                disabled={notApplicable}
                onChange={(e) => setVair(e.target.value)}
              >
                <option value="">none</option>
                {terms.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            {partialVocabulary ? (
              <p className="onto-nonterm">
                The {terms.length} {node.cls} terms name a population this node
                is not part of, so it needs none. Pick one only if it fits.
              </p>
            ) : (
              /* The list can exist and still hold nothing that fits. Recording
                 that, case by case, stops the card asking forever. */
              <label className="onto-checkbox">
                <input
                  type="checkbox"
                  data-testid="term-not-applicable"
                  checked={notApplicable}
                  onChange={(e) => setNotApplicable(e.target.checked)}
                />
                None of the {terms.length} terms applies to this node
              </label>
            )}
          </>
        ) : (
          <p className="onto-nonterm">
            {node.cls}: the vocabulary defines no term for this kind of node.
          </p>
        )}

        <label>
          Why (recorded on the card)
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        {node.fullText && (
          <section className="onto-popover-full">
            <h4>Source text</h4>
            <p>{node.fullText}</p>
          </section>
        )}

        {node.generatedLabel && (
          <section className="onto-popover-full">
            <h4>Generated name, before review</h4>
            <p>{node.generatedLabel}</p>
          </section>
        )}

        <div className="onto-edit-actions">
          <button
            type="button"
            className="btn"
            data-testid="save"
            disabled={pending || label.trim().length === 0}
            onClick={() =>
              onSave({
                label: label.trim(),
                ...(hasTerms
                  ? partialVocabulary
                    ? // No mark to send: nothing is flagging this node.
                      { vair: vair === "" ? null : vair }
                    : {
                        termNotApplicable: notApplicable,
                        ...(notApplicable
                          ? {}
                          : { vair: vair === "" ? null : vair }),
                      }
                  : {}),
                ...(note.trim() ? { note: note.trim() } : {}),
              })
            }
          >
            {pending ? "Saving..." : "Save"}
          </button>
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  // On the server there is no document to portal into; the editor only ever
  // opens from a click, so it never renders during SSR.
  return typeof document === "undefined"
    ? dialog
    : createPortal(dialog, document.body);
}
