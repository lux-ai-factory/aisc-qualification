"use client";

import type { OntologyChain, OntologyNode, OntologyView } from "@/domain/OntologyView";
import NodeChip from "./NodeChip";

// The AI card read top to bottom: the system's properties as rows, then one
// block per risk following AIRO's chain. It is the view that prints, the view an
// auditor reads line by line, and the view the downloads come from.
//

export default function VerticalCard({
  view,
  vocabularies,
  editing,
  pending,
  setEditing,
  onSave,
}: {
  view: OntologyView;
  vocabularies: Record<string, string[]>;
  editing: string | null;
  pending: boolean;
  setEditing: (id: string | null) => void;
  onSave: (
    nodeId: string,
    change: { label?: string; vair?: string | null; note?: string },
  ) => void;
}) {
  return (
    <>
      <h3 className="qf-group">About the system</h3>
      <table className="onto-table">
        <tbody>
          {view.rows.map((row) => (
            <tr key={row.property}>
              <th>
                {row.label}
                <span className="qf-citation">{row.citation}</span>
                <code>{row.property}</code>
              </th>
              <td>
                {row.nodes.map((node) => (
                  <NodeChip
                    key={node.id}
                    node={node}
                    vocabularies={vocabularies}
                    onEdit={() => setEditing(node.id)}
                  />
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="qf-group">Risks</h3>
      {view.chains.map((chain, i) => (
        <Chain
          key={chain.risk.id}
          chain={chain}
          index={i + 1}
          total={view.chains.length}
          vocabularies={vocabularies}
          editing={editing}
          pending={pending}
          setEditing={setEditing}
          onSave={onSave}
        />
      ))}
    </>
  );
}

function Chain({
  chain,
  index,
  total,
  vocabularies,
  setEditing,
}: {
  chain: OntologyChain;
  index: number;
  total: number;
  vocabularies: Record<string, string[]>;
  editing: string | null;
  pending: boolean;
  setEditing: (id: string | null) => void;
  onSave: (
    nodeId: string,
    change: { label?: string; vair?: string | null; note?: string },
  ) => void;
}) {
  const step = (label: string, node: OntologyNode | null) =>
    node ? (
      <div className="onto-step">
        <span className="onto-step-label">{label}</span>
        <NodeChip
          node={node}
          vocabularies={vocabularies}
          onEdit={() => setEditing(node.id)}
        />
      </div>
    ) : null;

  return (
    <div className="onto-chain">
      <div className="onto-chain-head">
        Risk {index} of {total}
        <span className="qf-citation">{chain.citation}</span>
      </div>
      <div className="onto-flow">
        {step("caused by", chain.source)}
        {step("exploiting", chain.vulnerability)}
        {step("the risk", chain.risk)}
        {step("leading to", chain.consequence)}
        {step("impact", chain.impact)}
      </div>
      <div className="onto-flow onto-flow--secondary">
        {step("affecting", chain.stakeholder)}
        {chain.areas.length > 0 && (
          <div className="onto-step">
            <span className="onto-step-label">areas</span>
            {chain.areas.map((area) => (
              <NodeChip
                key={area.id}
                node={area}
                vocabularies={vocabularies}
                onEdit={() => setEditing(area.id)}
              />
            ))}
          </div>
        )}
        {step("controlled by", chain.control)}
        {step("then", chain.followUp)}
      </div>
    </div>
  );
}
