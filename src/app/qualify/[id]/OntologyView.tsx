"use client";

import { useState, useTransition } from "react";
import type { OntologyNode, OntologyView as View } from "@/domain/OntologyView";
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
  qualificationId,
  initialView,
  initialProblems,
  vocabularies,
  downloads,
}: {
  qualificationId: string;
  initialView: View;
  initialProblems: string[];
  vocabularies: Record<string, string[]>;
  downloads: Downloads;
}) {
  const [view, setView] = useState(initialView);
  const [problems, setProblems] = useState(initialProblems);
  const [editing, setEditing] = useState<string | null>(null);
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

  const save = (
    nodeId: string,
    change: Parameters<typeof patchOntologyNode>[2],
  ) =>
    startTransition(async () => {
      setError(null);
      const result = await patchOntologyNode(qualificationId, nodeId, change);
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
      const result = await resetOntology(qualificationId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setView(result.view);
      setProblems(result.problems);
      setEditing(null);
    });

  const { counts } = view;
  const editingNode = findNode(view, editing);

  return (
    <section className="qf-section onto">
      {/* No heading: the tab that opened this panel already says "AI card",
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
              Graph
            </button>
            <button
              type="button"
              className={mode === "vertical" ? "active" : ""}
              onClick={() => setMode("vertical")}
              aria-pressed={mode === "vertical"}
            >
              Vertical
            </button>
          </div>
          {counts.reviewed > 0 && (
            <button
              type="button"
              className="btn ghost onto-reset"
              onClick={reset}
              disabled={pending}
            >
              Discard {counts.reviewed} edit{counts.reviewed === 1 ? "" : "s"}
            </button>
          )}
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

/** The node the pop-up is editing, found anywhere in the view. */
function findNode(view: View, id: string | null): OntologyNode | null {
  if (!id) return null;
  for (const row of view.rows) {
    const hit = row.nodes.find((n) => n.id === id);
    if (hit) return hit;
  }
  for (const chain of view.chains) {
    for (const key of [
      "risk",
      "source",
      "vulnerability",
      "consequence",
      "impact",
      "stakeholder",
      "control",
      "followUp",
    ] as const) {
      const candidate = chain[key];
      if (candidate && candidate.id === id) return candidate;
    }
    const area = chain.areas.find((a) => a.id === id);
    if (area) return area;
  }
  return view.system.id === id ? view.system : null;
}
