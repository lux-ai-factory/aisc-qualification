// The layout of AIRO's own Figure 3, applied to a filled graph.
//
// Two bands. The upper one holds everything about the system: the AI System in
// the middle, capability / purpose / domain above it, technique / modality /
// locality to its left, components below, and the operators and users to its
// right, with the areas of impact in its lower right. The lower one holds the
// risk chain running left to right, source -> risk -> consequence -> impact,
// with the vulnerability under its source and the controls beneath the risk;
// once per risk row. hasImpactOnArea and hasImpactOnStakeholder cross back up
// into the upper band, giving the figure its shape.
//
// Groups start collapsed as hubs so the first view is a dozen boxes, not sixty.
import type { OntologyNode, OntologyView } from "./OntologyView";

export const NODE_W = 230;
export const NODE_H = 76;

const COL = NODE_W + 90;
const ROW = NODE_H + 54;

/** Boundary between the two bands: above is the system, below is risk.
 *
 * The upper band's lowest slot is row 1.6, so this only needs to clear it.
 * Anything larger leaves dead space and pushes the layout past what the canvas
 * shows without zooming out. */
export const BAND_SPLIT = 2.2 * ROW;

/** Where the system sits, and the grid the upper band is laid out on. */
const SYSTEM = { col: 0, row: 0 };

/**
 * The upper band, in Figure 3's arrangement. Columns and rows are relative to
 * the AI System at the origin; the figure's own placement is the authority.
 *
 * `away` is the direction an opened group grows in. Figure 3 has one box per
 * class, so it can stack a column; a group of six cannot, and stacking downward
 * runs it straight into the slot below. Growing away from the system uses the
 * free space outside the figure instead.
 */
type Slot = {
  col: number;
  row: number;
  away: "up" | "down" | "left" | "right";
};

const UPPER_SLOTS: Record<string, Slot> = {
  hasCapability: { col: -2, row: -2, away: "up" },
  hasPurpose: { col: -1, row: -2, away: "up" },
  isAppliedWithinDomain: { col: 0, row: -2, away: "up" },
  usesTechnique: { col: -2, row: -1, away: "left" },
  hasModality: { col: -2, row: 0, away: "left" },
  isUsedWithinLocality: { col: -2, row: 1, away: "left" },
  hasComponent: { col: 0, row: 1.6, away: "down" },
  isProvidedBy: { col: 2, row: -2, away: "right" },
  isDeployedBy: { col: 2, row: -1, away: "right" },
  hasAIUser: { col: 2, row: 0, away: "right" },
};

/** Step `n` places from a slot, in its own outward direction. */
function outward(
  base: { x: number; y: number },
  away: Slot["away"],
  n: number,
): { x: number; y: number } {
  const dx = NODE_W + 40;
  const dy = NODE_H + 26;
  switch (away) {
    case "up":
      return { x: base.x, y: base.y - n * dy };
    case "down":
      return { x: base.x, y: base.y + n * dy };
    case "left":
      return { x: base.x - n * dx, y: base.y };
    case "right":
      return { x: base.x + n * dx, y: base.y };
  }
}
/** Where an Impact's areas are drawn: lower right of the upper band. */
const AREA_SLOT = { col: 1.2, row: 1.6 };

/** The lower band, one row per risk, relative to that row's own origin. */
const CHAIN_SLOTS = {
  source: { col: -2, row: 0 },
  risk: { col: 0, row: 0 },
  consequence: { col: 1.6, row: 0 },
  impact: { col: 3.2, row: 0 },
  vulnerability: { col: -2, row: 1 },
  control: { col: 0, row: 1 },
  followUp: { col: 1.6, row: 1 },
};
/** An open chain needs two rows plus breathing room; a collapsed risk is one
 * box and should take one row. Reserving the full height for all of them made
 * five collapsed risks 1625px tall on their own, which forced fitView down to
 * 0.43 and left everything small in the middle of the canvas. */
const CHAIN_ROW_HEIGHT = 2.5 * ROW;
const COLLAPSED_ROW_HEIGHT = NODE_H + 44;

export type HubData = {
  property: string;
  label: string;
  count: number;
  expanded: boolean;
};

export type FigureNode = {
  id: string;
  type: "airo" | "hub";
  /** Which of the figure's two boxes this node belongs to. Explicit rather than
   * derived from y: an opened group can reach past where the nominal boundary
   * sits, and it still belongs to the band it grew out of. */
  band: "system" | "risk";
  position: { x: number; y: number };
  data: {
    node?: OntologyNode;
    hub?: HubData;
    childCount: number;
    expanded: boolean;
  };
};

export type FigureEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
};

export type FigureBand = {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FigureLayout = {
  nodes: FigureNode[];
  edges: FigureEdge[];
  bands: FigureBand[];
};

export function hubId(property: string): string {
  return `hub:${property}`;
}

const at = (col: number, row: number) => ({ x: col * COL, y: row * ROW });

export function layoutFigure(
  view: OntologyView,
  expanded: ReadonlySet<string>,
): FigureLayout {
  const nodes: FigureNode[] = [];
  const edges: FigureEdge[] = [];
  const placed = new Set<string>();

  const put = (n: FigureNode) => {
    if (placed.has(n.id)) return;
    placed.add(n.id);
    nodes.push(n);
  };
  const airo = (
    n: OntologyNode,
    p: { x: number; y: number },
    band: "system" | "risk",
    childCount = 0,
  ): FigureNode => ({
    id: n.id,
    type: "airo",
    band,
    position: p,
    data: { node: n, childCount, expanded: expanded.has(n.id) },
  });
  const connect = (source: string, target: string, label: string) => {
    if (!placed.has(source) || !placed.has(target)) return;
    edges.push({ id: `${source}--${label}--${target}`, source, target, label });
  };

  put(airo(view.system, at(SYSTEM.col, SYSTEM.row), "system"));

  // ── upper band ───────────────────────────────────────────────────────────
  for (const row of view.rows) {
    const slot = UPPER_SLOTS[row.property];
    if (!slot) continue; // a property the figure gives no place
    const base = at(slot.col, slot.row);

    if (row.nodes.length === 1) {
      put(airo(row.nodes[0], base, "system"));
      connect(view.system.id, row.nodes[0].id, row.property);
      continue;
    }

    const id = hubId(row.property);
    const open = expanded.has(id);
    put({
      id,
      type: "hub",
      band: "system",
      position: base,
      data: {
        hub: {
          property: row.property,
          label: row.label,
          count: row.nodes.length,
          expanded: open,
        },
        childCount: row.nodes.length,
        expanded: open,
      },
    });
    connect(view.system.id, id, row.property);

    if (!open) continue;
    // Members grow outward from their slot, so an opened group stays anchored
    // where you clicked without colliding with its neighbours.
    row.nodes.forEach((member, i) => {
      put(airo(member, outward(base, slot.away, i + 1), "system"));
      edges.push({
        id: `${id}--member--${member.id}`,
        source: id,
        target: member.id,
        label: "",
      });
    });
  }

  // ── lower band, one Figure 3 chain per risk ─────────────────────────────
  // The risk band starts below the nominal split, or below whatever the system
  // band has actually grown to, whichever is lower: the components group grows
  // downward and would otherwise land on the first risk.
  const systemBottom = Math.max(
    ...nodes.map((n) => n.position.y + NODE_H),
    BAND_SPLIT,
  );
  // Rows are laid out in sequence rather than on a fixed pitch, so an open
  // chain takes its space and the risks below simply move down.
  let top = Math.max(BAND_SPLIT + 0.7 * ROW, systemBottom + 0.5 * ROW);
  view.chains.forEach((chain) => {
    const rowTop = top;
    top += expanded.has(chain.risk.id)
      ? CHAIN_ROW_HEIGHT
      : COLLAPSED_ROW_HEIGHT;
    const slot = (s: { col: number; row: number }) => ({
      x: s.col * COL,
      y: rowTop + s.row * ROW,
    });

    // What a click would actually add. The stakeholder is usually the user node
    // from the upper band, and areas are shared between risks, so counting the
    // whole chain would promise boxes that are already on screen.
    const members = [
      chain.source,
      chain.vulnerability,
      chain.consequence,
      chain.impact,
      chain.stakeholder,
      chain.control,
      chain.followUp,
      ...chain.areas,
    ].filter((n): n is OntologyNode => Boolean(n));
    const open = expanded.has(chain.risk.id);
    const hidden = open
      ? 0
      : new Set(members.filter((n) => !placed.has(n.id)).map((n) => n.id)).size;

    put(airo(chain.risk, slot(CHAIN_SLOTS.risk), "risk", hidden));
    connect(view.system.id, chain.risk.id, "hasRisk");

    if (!open) return;

    if (chain.source) {
      put(airo(chain.source, slot(CHAIN_SLOTS.source), "risk"));
      connect(chain.source.id, chain.risk.id, "isRiskSourceFor");
      if (chain.vulnerability) {
        put(airo(chain.vulnerability, slot(CHAIN_SLOTS.vulnerability), "risk"));
        connect(
          chain.source.id,
          chain.vulnerability.id,
          "exploitsVulnerability",
        );
      }
    }
    if (chain.consequence) {
      put(airo(chain.consequence, slot(CHAIN_SLOTS.consequence), "risk"));
      connect(chain.risk.id, chain.consequence.id, "hasConsequence");
      if (chain.impact) {
        put(airo(chain.impact, slot(CHAIN_SLOTS.impact), "risk"));
        connect(chain.consequence.id, chain.impact.id, "hasImpact");

        // The two edges that cross back up into the upper band.
        if (chain.stakeholder) {
          put(
            airo(
              chain.stakeholder,
              at(UPPER_SLOTS.hasAIUser.col, UPPER_SLOTS.hasAIUser.row),
              "system",
            ),
          );
          connect(
            chain.impact.id,
            chain.stakeholder.id,
            "hasImpactOnStakeholder",
          );
        }
        chain.areas.forEach((area, i) => {
          put(airo(area, at(AREA_SLOT.col + i * 0.9, AREA_SLOT.row), "system"));
          connect(chain.impact!.id, area.id, "hasImpactOnArea");
        });
      }
    }
    if (chain.control) {
      put(airo(chain.control, slot(CHAIN_SLOTS.control), "risk"));
      connect(chain.control.id, chain.risk.id, "modifiesRiskConcept");
      if (chain.followUp) {
        put(airo(chain.followUp, slot(CHAIN_SLOTS.followUp), "risk"));
        connect(chain.control.id, chain.followUp.id, "isFollowedByControl");
      }
    }
  });

  return { nodes, edges, bands: bands(nodes) };
}

/** The two dashed boxes, sized to whatever is currently on screen. */
function bands(nodes: FigureNode[]): FigureBand[] {
  const pad = 46;
  const box = (subset: FigureNode[]) => {
    const xs = subset.map((n) => n.position.x);
    const ys = subset.map((n) => n.position.y);
    return {
      x: Math.min(...xs) - pad,
      y: Math.min(...ys) - pad,
      width: Math.max(...xs) + NODE_W - Math.min(...xs) + pad * 2,
      height: Math.max(...ys) + NODE_H - Math.min(...ys) + pad * 2,
    };
  };
  const upper = nodes.filter((n) => n.band === "system");
  const lower = nodes.filter((n) => n.band === "risk");
  const out: FigureBand[] = [];
  if (upper.length) {
    out.push({
      label: "Concepts regarding AI system and its use",
      ...box(upper),
    });
  }
  if (lower.length) {
    out.push({ label: "Concepts regarding risk", ...box(lower) });
  }
  return out;
}
