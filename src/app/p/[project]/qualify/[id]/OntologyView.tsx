"use client";

import { useState, useTransition } from "react";
import {
  findNode,
  type NodePatch,
  type OntologyView as View,
} from "@/domain/OntologyView";
import { patchOntologyNode, resetOntology } from "./ontology-actions";
import NodeEditor from "./NodeEditor";
import OntologyGraph from "./OntologyGraph";
import CardDownloads, { type Downloads } from "./CardDownloads";
import VerticalCard from "./VerticalCard";

// The AI card, which is this system's knowledge graph, in its two views: the
// graph drawn as AIRO's Figure 3, and the vertical card that prints and
// downloads. AIRO is the ontology those nodes conform to; the nodes themselves
// are this system's instance data.
// Editing is per node, and every edit is recorded as a review.
export default function OntologyView({
  projectId,
  qualificationId,
  initialView,
  initialProblems,
  vocabularies,
  downloads,
  readOnly = false,
}: {
  projectId: string;
  qualificationId: string;
  initialView: View;
  initialProblems: string[];
  vocabularies: Record<string, string[]>;
  downloads: Downloads;
  /** An older version's card: shown, never edited (only the latest changes). */
  readOnly?: boolean;
}) {
  const [view, setView] = useState(initialView);
  const [problems, setProblems] = useState(initialProblems);
  const [editingState, setEditingState] = useState<string | null>(null);
  const editing = readOnly ? null : editingState;
  const setEditing = (id: string | null) => {
    if (!readOnly) setEditingState(id);
  };
  // The graph is the default: it is what you navigate. The vertical card is
  // what prints and what an auditor reads line by line, so both stay available.
  const [mode, setMode] = useState<"graph" | "vertical">("graph");
  // Which groups are open. All collapsed at first: a dozen boxes rather than 59.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Undoing throws the reviewer's work away, so the button asks first, here in
  // the page, and only the second answer undoes anything.
  const [askingUndo, setAskingUndo] = useState(false);

  const save = (nodeId: string, change: NodePatch) =>
    startTransition(async () => {
      setError(null);
      const result = await patchOntologyNode(
        projectId,
        qualificationId,
        nodeId,
        change,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setView(result.view);
      setProblems(result.problems);
      setEditing(null);
    });

  const reset = () =>
    startTransition(async () => {
      setError(null);
      const result = await resetOntology(projectId, qualificationId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setView(result.view);
      setProblems(result.problems);
      setEditing(null);
      setAskingUndo(false);
    });

  const { counts } = view;
  const corrections = `${counts.reviewed} correction${counts.reviewed === 1 ? "" : "s"}`;
  const editingNode = findNode(view, editing);

  return (
    <section className="qf-section onto">
      {/* No heading: the menu entry that opened this panel already says "AI card",
          and the view buttons are what you actually reach for here. */}
      <div className="onto-head">
        <CardDownloads downloads={downloads} />
        <div className="onto-actions">
          {expanded.size > 0 && (
            <button
              type="button"
              className="btn ghost onto-collapse-all"
              onClick={() => setExpanded(new Set())}
            >
              Fold {expanded.size} open group{expanded.size === 1 ? "" : "s"}
            </button>
          )}
          <div className="onto-modes" role="group" aria-label="Card view">
            <button
              type="button"
              className={mode === "graph" ? "active" : ""}
              onClick={() => setMode("graph")}
              aria-pressed={mode === "graph"}
            >
              Diagram
            </button>
            <button
              type="button"
              className={mode === "vertical" ? "active" : ""}
              onClick={() => setMode("vertical")}
              aria-pressed={mode === "vertical"}
            >
              List
            </button>
          </div>
          {!readOnly &&
            counts.reviewed > 0 &&
            (askingUndo ? (
              <span className="qf-retire onto-reset">
                <span className="qf-retire-question">
                  Undo your {corrections} to this AI card?
                </span>{" "}
                <button
                  type="button"
                  className="btn ghost"
                  onClick={reset}
                  disabled={pending}
                >
                  Undo them
                </button>{" "}
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setAskingUndo(false)}
                  disabled={pending}
                >
                  Keep them
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="btn ghost onto-reset"
                onClick={() => setAskingUndo(true)}
                disabled={pending}
              >
                Undo my {corrections}
              </button>
            ))}
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {problems.length > 0 && (
        <div className="error">
          {problems.length} validation problem{problems.length === 1 ? "" : "s"}
          : {problems[0]}
        </div>
      )}

      {mode === "graph" ? (
        <OntologyGraph
          view={view}
          vocabularies={vocabularies}
          editing={editing}
          setEditing={setEditing}
          expanded={expanded}
          onToggleExpand={toggleExpand}
        />
      ) : (
        <VerticalCard
          view={view}
          vocabularies={vocabularies}
          editing={editing}
          pending={pending}
          setEditing={setEditing}
          onSave={save}
        />
      )}
      {/* One editor for the whole card, above everything, so it can never be
          clipped by a node or hidden behind one. */}
      {editingNode && (
        <NodeEditor
          node={editingNode}
          vocabularies={vocabularies}
          pending={pending}
          onCancel={() => setEditing(null)}
          onSave={(change) => save(editingNode.id, change)}
        />
      )}
    </section>
  );
}
