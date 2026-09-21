"use client";

import type { OntologyNode } from "@/domain/OntologyView";

export type NodeChange = {
  label?: string;
  vair?: string | null;
  note?: string;
};

// One AIRO individual, as a chip. Clicking it asks the page to open NodeEditor,
// which is a pop-up: the editor used to expand in place here, which grew the
// node, clipped against its neighbours and could paint behind them.
export default function NodeChip({
  node,
  vocabularies,
  onEdit,
}: {
  node: OntologyNode;
  vocabularies: Record<string, string[]>;
  onEdit: () => void;
}) {
  const terms = (node.cls && vocabularies[node.cls]) || [];
  // Three ways a node can legitimately carry no term. VAIR defines no
  // specialisation at all for some AIRO classes (Risk, Vulnerability, AIUser).
  // For others the list exists but names a different population, which the view
  // marks with termExpected: false (AIOperator's 17 terms are all Annex III
  // public bodies, so a commercial provider is not among them). And a reviewer
  // can determine case by case that nothing in a list fits. In all three an
  // untyped node is complete, not deficient: show the class, not a gap.
  const typeable =
    terms.length > 0 && node.termExpected !== false && !node.termNotApplicable;

  // A flagged node is the review queue: the agent drafted it, reviewed its own
  // draft, and could not settle this one. Clearing it is an edit.
  const flags = node.flags ?? [];

  return (
    <button
      type="button"
      className={`onto-node onto-${node.provenance}${
        flags.length ? " onto-flagged" : ""
      }`}
      onClick={onEdit}
      title={node.fullText ?? node.label}
    >
      <span className="onto-label">{node.label}</span>
      <span className="onto-node-meta">
        {node.vair ? (
          <span className="onto-vair">{node.vair}</span>
        ) : typeable ? (
          <span className="onto-untyped">no term</span>
        ) : (
          <span className="onto-class">{node.cls}</span>
        )}
        {flags.map((flag) => (
          <span className="onto-flag" key={flag}>
            {flag}
          </span>
        ))}
        {node.provenance === "reviewed" && (
          <span className="onto-badge">reviewed</span>
        )}
        {node.provenance === "extracted" && (
          <span className="onto-badge onto-badge--extracted">extracted</span>
        )}
      </span>
    </button>
  );
}
