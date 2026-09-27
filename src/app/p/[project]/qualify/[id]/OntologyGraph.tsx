"use client";

import { useMemo } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  MarkerType,
  ReactFlow,
  ViewportPortal,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { OntologyNode, OntologyView } from "@/domain/OntologyView";
import { NODE_W, layoutFigure, type HubData } from "@/domain/ontologyFigure";
import NodeChip from "./NodeChip";

// The navigable view, laid out as AIRO's own Figure 3: an upper band for the
// system and its properties, a lower band for the risk chains, and the impact
// edges crossing back up. Groups open on click. Positions come from
// domain/ontologyFigure (pure and tested); this file is the canvas, the two
// node renderers and the band frames.

type Shared = {
  vocabularies: Record<string, string[]>;
  setEditing: (id: string | null) => void;
  onToggleExpand: (id: string) => void;
};

type AiroData = Shared & {
  node: OntologyNode;
  childCount: number;
  expanded: boolean;
};

type HubNodeData = Shared & { hub: HubData };

export default function OntologyGraph({
  view,
  vocabularies,
  editing,
  setEditing,
  expanded,
  onToggleExpand,
}: {
  view: OntologyView;
  vocabularies: Record<string, string[]>;
  editing: string | null;
  setEditing: (id: string | null) => void;
  expanded: ReadonlySet<string>;
  onToggleExpand: (id: string) => void;
}) {
  const layout = useMemo(() => layoutFigure(view, expanded), [view, expanded]);

  const nodes = useMemo(
    () =>
      layout.nodes.map((n) => ({
        ...n,
        data: { ...n.data, vocabularies, setEditing, onToggleExpand },
        // Declared so React Flow can place edges without waiting to measure the
        // DOM, and so the figure's columns line up. The editor is a pop-up now,
        // so nothing has to grow.
        style: { width: NODE_W },
        // The node being edited paints above its neighbours.
        zIndex: editing === n.id ? 10 : 0,
        draggable: true,
      })),
    [layout.nodes, vocabularies, editing, setEditing, onToggleExpand],
  );

  const edges = useMemo(
    () =>
      layout.edges.map((e) => ({
        ...e,
        type: "smoothstep",
        // Darker and thicker than the defaults: the form's #cccccc disappears
        // on a white canvas once you zoom out.
        labelStyle: { fontSize: 11, fontWeight: 600, fill: "#4a5265" },
        labelBgStyle: { fill: "#ffffff", fillOpacity: 0.95 },
        labelBgPadding: [4, 2] as [number, number],
        style: {
          stroke: e.label ? "#7b8499" : "#aab2c2",
          strokeWidth: e.label ? 1.6 : 1.2,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#7b8499" },
      })),
    [layout.edges],
  );

  return (
    <div className="onto-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        // A floor on the initial fit: without it a tall graph opens at 0.4 and
        // everything is unreadable in the middle of the canvas. Above the floor
        // the content simply overflows and you pan to it.
        fitViewOptions={{ padding: 0.08, minZoom: 0.78, maxZoom: 1 }}
        minZoom={0.1}
        maxZoom={1.8}
        onPaneClick={() => setEditing(null)}
      >
        {/* The figure's two dashed frames. Inside a ViewportPortal so they
            live in flow coordinates and pan and zoom with the nodes. */}
        <ViewportPortal>
          {layout.bands.map((band) => (
            <div
              key={band.label}
              className="onto-band"
              style={{
                transform: `translate(${band.x}px, ${band.y}px)`,
                width: band.width,
                height: band.height,
                // A ViewportPortal is the viewport's last child, so it paints
                // over the edges and nodes. The frames belong behind them.
                zIndex: -1,
              }}
            >
              <span className="onto-band-label">{band.label}</span>
            </div>
          ))}
        </ViewportPortal>
        <Background gap={26} size={1.4} color="#c8cfdd" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeStrokeWidth={2} />
      </ReactFlow>
    </div>
  );
}

/** A real AIRO individual: the same chip and editor the table renders. */
function AiroFlowNode({ data }: NodeProps) {
  const d = data as unknown as AiroData;
  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div className="onto-flow-node">
        <NodeChip
          node={d.node}
          vocabularies={d.vocabularies}
          onEdit={() => d.setEditing(d.node.id)}
        />
        {d.childCount > 0 && (
          <button
            type="button"
            className="onto-expander"
            data-testid={`expand-${d.node.id}`}
            aria-expanded={d.expanded}
            title={
              d.expanded
                ? "Hide this risk's chain"
                : `Show the ${d.childCount} hidden node${d.childCount === 1 ? "" : "s"} of this risk's chain`
            }
            onClick={(e) => {
              e.stopPropagation();
              d.onToggleExpand(d.node.id);
            }}
          >
            {d.expanded ? "−" : "+"}
            <span className="onto-expander-count">{d.childCount}</span>
          </button>
        )}
      </div>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </>
  );
}

/** A collapsed property group: click it to fan its members out. */
function HubFlowNode({ id, data }: NodeProps) {
  const d = data as unknown as HubNodeData;
  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <button
        type="button"
        className={`onto-hub${d.hub.expanded ? " open" : ""}`}
        aria-expanded={d.hub.expanded}
        title={
          d.hub.expanded
            ? `Hide the ${d.hub.count} ${d.hub.label.toLowerCase()}`
            : `Show the ${d.hub.count} ${d.hub.label.toLowerCase()}`
        }
        onClick={() => d.onToggleExpand(id)}
      >
        <span className="onto-hub-label">{d.hub.label}</span>
        <span className="onto-hub-count">{d.hub.count}</span>
      </button>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </>
  );
}

// Defined once, outside the component: React Flow warns if this object identity
// changes between renders.
const NODE_TYPES = { airo: AiroFlowNode, hub: HubFlowNode };
