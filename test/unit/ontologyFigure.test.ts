import { describe, it, expect } from "vitest";
import {
  layoutFigure,
  hubId,
  BAND_SPLIT,
  NODE_W,
  NODE_H,
  type FigureLayout,
} from "@/domain/ontologyFigure";
import type { OntologyNode, OntologyView } from "@/domain/OntologyView";

const node = (id: string, cls: string): OntologyNode => ({
  id,
  label: id,
  cls,
  vair: null,
  fullText: null,
  provenance: "form",
});

/** The MCAS shape in miniature: every upper-band slot plus two risks. */
function view(): OntologyView {
  const users = node("users", "AIUser");
  const row = (property: string, label: string, nodes: OntologyNode[]) => ({
    property,
    label,
    citation: "c",
    nodes,
  });
  return {
    system: node("system", "AISystem"),
    answers: [],
    rows: [
      row("hasPurpose", "Purpose", [node("purpose", "Purpose")]),
      row("hasCapability", "Capabilities", [
        node("cap0", "AICapability"),
        node("cap1", "AICapability"),
      ]),
      row("isAppliedWithinDomain", "Domain", [node("domain0", "Domain")]),
      row("hasModality", "Market form", [node("modality0", "Modality")]),
      row("isUsedWithinLocality", "Locality", [
        node("locality0", "LocalityOfUse"),
      ]),
      row("isProvidedBy", "Provider", [node("provider", "AIOperator")]),
      row("isDeployedBy", "Deployers", [node("deployer", "AIOperator")]),
      row("hasAIUser", "Users", [users]),
      row("usesTechnique", "Techniques", [
        node("tech0", "AITechnique"),
        node("tech1", "AITechnique"),
      ]),
      row("hasComponent", "Components", [
        node("comp0", "AIComponent"),
        node("comp1", "AIComponent"),
      ]),
    ],
    chains: [0, 1].map((k) => ({
      risk: node(`risk${k}`, "Risk"),
      source: node(`risk${k}_source`, "RiskSource"),
      vulnerability: k === 0 ? node(`risk${k}_vuln`, "Vulnerability") : null,
      consequence: node(`risk${k}_cons`, "Consequence"),
      impact: node(`risk${k}_imp`, "Impact"),
      stakeholder: users,
      areas: [node("area_right", "AreaOfImpact")],
      control: node(`risk${k}_ctrl`, "RiskControl"),
      followUp: k === 0 ? node(`risk${k}_follow`, "RiskControl") : null,
      citation: "c",
    })),
    counts: {
      nodes: 0,
      triples: 0,
      risks: 2,
      reviewed: 0,
      untyped: 0,
      flagged: 0,
      needsTerm: 0,
      unclassifiable: 0,
    },
  };
}

const ids = (l: FigureLayout) => l.nodes.map((n) => n.id);
const at = (l: FigureLayout, id: string) =>
  l.nodes.find((n) => n.id === id)!.position;

describe("layoutFigure, the two bands of AIRO Figure 3", () => {
  it("opens with the system, one spoke per upper-band group, and one node per risk", () => {
    const l = layoutFigure(view(), new Set());
    // system + 10 upper slots (2 of them hubs) + 2 risks = 13
    expect(ids(l)).toContain("system");
    expect(ids(l)).toContain("purpose");
    expect(ids(l)).toContain(hubId("hasCapability"));
    expect(ids(l)).toContain("risk0");
    expect(ids(l)).not.toContain("cap0");
    expect(ids(l)).not.toContain("risk0_source");
    expect(l.nodes).toHaveLength(13);
  });

  it("names the two bands the figure names", () => {
    const l = layoutFigure(view(), new Set());
    expect(l.bands.map((b) => b.label)).toEqual([
      "Concepts regarding AI system and its use",
      "Concepts regarding risk",
    ]);
  });

  it("puts everything about the system above the split, and the risk chain below", () => {
    const l = layoutFigure(view(), new Set(["risk0"]));
    for (const id of ["system", "purpose", "domain0", "provider", "users"]) {
      expect(at(l, id).y, id).toBeLessThan(BAND_SPLIT);
    }
    for (const id of ["risk0", "risk0_source", "risk0_cons", "risk0_imp"]) {
      expect(at(l, id).y, id).toBeGreaterThan(BAND_SPLIT);
    }
  });

  // ── the upper band, arranged as the figure arranges it ───────────────────

  it("places capability, purpose and domain above the system", () => {
    const l = layoutFigure(view(), new Set());
    const sys = at(l, "system");
    for (const id of [hubId("hasCapability"), "purpose", "domain0"]) {
      expect(at(l, id).y, id).toBeLessThan(sys.y);
    }
  });

  it("places technique, market form and locality to the left of the system", () => {
    const l = layoutFigure(view(), new Set());
    const sys = at(l, "system");
    for (const id of [hubId("usesTechnique"), "modality0", "locality0"]) {
      expect(at(l, id).x, id).toBeLessThan(sys.x);
    }
  });

  it("places provider, deployers and users to the right of the system", () => {
    const l = layoutFigure(view(), new Set());
    const sys = at(l, "system");
    for (const id of ["provider", "deployer", "users"]) {
      expect(at(l, id).x, id).toBeGreaterThan(sys.x);
    }
  });

  it("places components below the system, still in the upper band", () => {
    const l = layoutFigure(view(), new Set());
    const comp = at(l, hubId("hasComponent"));
    expect(comp.y).toBeGreaterThan(at(l, "system").y);
    expect(comp.y).toBeLessThan(BAND_SPLIT);
  });

  // ── the lower band: one Figure 3 chain per risk ──────────────────────────

  it("runs each chain left to right: source, risk, consequence, impact", () => {
    const l = layoutFigure(view(), new Set(["risk0"]));
    const x = (id: string) => at(l, id).x;
    expect(x("risk0_source")).toBeLessThan(x("risk0"));
    expect(x("risk0")).toBeLessThan(x("risk0_cons"));
    expect(x("risk0_cons")).toBeLessThan(x("risk0_imp"));
  });

  it("hangs the vulnerability under its risk source, as the figure does", () => {
    const l = layoutFigure(view(), new Set(["risk0"]));
    expect(at(l, "risk0_vuln").x).toBe(at(l, "risk0_source").x);
    expect(at(l, "risk0_vuln").y).toBeGreaterThan(at(l, "risk0_source").y);
  });

  it("puts the control below the risk, and its follow-up beside it", () => {
    const l = layoutFigure(view(), new Set(["risk0"]));
    expect(at(l, "risk0_ctrl").y).toBeGreaterThan(at(l, "risk0").y);
    expect(at(l, "risk0_follow").x).toBeGreaterThan(at(l, "risk0_ctrl").x);
    expect(at(l, "risk0_follow").y).toBe(at(l, "risk0_ctrl").y);
  });

  it("stacks one row per risk", () => {
    const l = layoutFigure(view(), new Set(["risk0", "risk1"]));
    expect(at(l, "risk1").y).toBeGreaterThan(at(l, "risk0").y);
    expect(at(l, "risk1_source").y).toBeGreaterThan(at(l, "risk0_ctrl").y);
  });

  // ── the crossing edges that make the figure the figure ──────────────────

  it("keeps the impact targets in the upper band so those edges cross up", () => {
    const l = layoutFigure(view(), new Set(["risk0"]));
    // the area a lower-band Impact points at is drawn in the upper band
    expect(at(l, "area_right").y).toBeLessThan(BAND_SPLIT);
    expect(at(l, "risk0_imp").y).toBeGreaterThan(BAND_SPLIT);
    expect(at(l, "users").y).toBeLessThan(BAND_SPLIT);
    const crossing = l.edges.filter(
      (e) =>
        e.label === "hasImpactOnArea" || e.label === "hasImpactOnStakeholder",
    );
    expect(crossing).toHaveLength(2);
  });

  it("shows an area of impact only once a risk that reaches it is open", () => {
    expect(ids(layoutFigure(view(), new Set()))).not.toContain("area_right");
    expect(ids(layoutFigure(view(), new Set(["risk0"])))).toContain(
      "area_right",
    );
  });

  it("keeps a shared node single across two open risks", () => {
    const l = layoutFigure(view(), new Set(["risk0", "risk1"]));
    expect(l.nodes.filter((n) => n.id === "users")).toHaveLength(1);
    expect(l.nodes.filter((n) => n.id === "area_right")).toHaveLength(1);
  });

  it("keeps AIRO's own direction on every edge", () => {
    const l = layoutFigure(view(), new Set(["risk0"]));
    const find = (label: string) => l.edges.find((e) => e.label === label)!;
    expect(find("isRiskSourceFor")).toMatchObject({
      source: "risk0_source",
      target: "risk0",
    });
    expect(find("hasConsequence")).toMatchObject({
      source: "risk0",
      target: "risk0_cons",
    });
    expect(find("modifiesRiskConcept")).toMatchObject({
      source: "risk0_ctrl",
      target: "risk0",
    });
    expect(find("hasRisk")).toMatchObject({
      source: "system",
      target: "risk0",
    });
  });

  // ── expansion ───────────────────────────────────────────────────────────

  it("grows an opened group outward from its own slot, away from the system", () => {
    // Figure 3 has one box per class and can stack a column; a group of six
    // cannot, so members grow into the free space outside the figure.
    const capsOpen = layoutFigure(view(), new Set([hubId("hasCapability")]));
    const capHub = at(capsOpen, hubId("hasCapability"));
    const sys = at(capsOpen, "system");
    for (const id of ["cap0", "cap1"]) {
      const p = at(capsOpen, id);
      expect(p.x, id).toBe(capHub.x); // the top row grows upward
      expect(p.y, id).toBeLessThan(capHub.y);
      expect(p.y, id).toBeLessThan(sys.y);
    }

    const techOpen = layoutFigure(view(), new Set([hubId("usesTechnique")]));
    const techHub = at(techOpen, hubId("usesTechnique"));
    for (const id of ["tech0", "tech1"]) {
      const p = at(techOpen, id);
      expect(p.y, id).toBe(techHub.y); // the left column grows leftward
      expect(p.x, id).toBeLessThan(techHub.x);
    }
  });

  it("folds a hub away again", () => {
    const open = layoutFigure(view(), new Set([hubId("hasCapability")]));
    const shut = layoutFigure(view(), new Set());
    expect(open.nodes.length - shut.nodes.length).toBe(2);
  });

  it("reports how many children each collapsible node hides", () => {
    const l = layoutFigure(view(), new Set());
    const hub = l.nodes.find((n) => n.id === hubId("hasCapability"))!;
    expect(hub.type).toBe("hub");
    expect(hub.data.hub).toMatchObject({ label: "Capabilities", count: 2 });
    const risk = l.nodes.find((n) => n.id === "risk0")!;
    // source, vulnerability, consequence, impact, area, control, follow-up.
    // The stakeholder is the upper band's user node, already on screen, so it
    // is not promised: see the expander-count tests below.
    expect(risk.data.childCount).toBe(7);
  });

  it("never overlaps two node boxes, fully expanded", () => {
    const all = new Set([
      "risk0",
      "risk1",
      hubId("hasCapability"),
      hubId("usesTechnique"),
      hubId("hasComponent"),
    ]);
    const l = layoutFigure(view(), all);
    const bad: string[] = [];
    for (let i = 0; i < l.nodes.length; i++) {
      for (let j = i + 1; j < l.nodes.length; j++) {
        const a = l.nodes[i].position;
        const b = l.nodes[j].position;
        if (Math.abs(a.x - b.x) < NODE_W && Math.abs(a.y - b.y) < NODE_H) {
          bad.push(`${l.nodes[i].id} / ${l.nodes[j].id}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("copes with an empty view", () => {
    const l = layoutFigure(
      {
        system: node("system", "AISystem"),
        answers: [],
        rows: [],
        chains: [],
        counts: {
          nodes: 1,
          triples: 1,
          risks: 0,
          reviewed: 0,
          untyped: 0,
          flagged: 0,
          needsTerm: 0,
          unclassifiable: 0,
        },
      },
      new Set(),
    );
    expect(l.nodes).toHaveLength(1);
    expect(l.edges).toHaveLength(0);
  });
});

describe("the expander count promises only what a click reveals", () => {
  it("excludes a stakeholder that is already on screen in the upper band", () => {
    const l = layoutFigure(view(), new Set());
    const risk0 = l.nodes.find((n) => n.id === "risk0")!;
    // the chain is source, vulnerability, consequence, impact, stakeholder,
    // control, follow-up + 1 area = 8, but the user node is the hasAIUser slot
    // and is already visible, so a click adds 7
    expect(risk0.data.childCount).toBe(7);
  });

  it("drops further once another risk has already revealed a shared area", () => {
    const alone = layoutFigure(view(), new Set());
    const withRisk0Open = layoutFigure(view(), new Set(["risk0"]));
    const before = alone.nodes.find((n) => n.id === "risk1")!.data.childCount;
    const after = withRisk0Open.nodes.find((n) => n.id === "risk1")!.data
      .childCount;
    // risk1 shares area_right with risk0, which is now placed
    expect(after).toBe(before - 1);
  });

  it("counts nothing once the risk itself is open", () => {
    const l = layoutFigure(view(), new Set(["risk0"]));
    const risk0 = l.nodes.find((n) => n.id === "risk0")!;
    expect(risk0.data.expanded).toBe(true);
    expect(risk0.data.childCount).toBe(0);
  });

  it("still reveals exactly as many nodes as the badge promised", () => {
    const shut = layoutFigure(view(), new Set());
    const promised = shut.nodes.find((n) => n.id === "risk0")!.data.childCount;
    const open = layoutFigure(view(), new Set(["risk0"]));
    expect(open.nodes.length - shut.nodes.length).toBe(promised);
  });
});

describe("a collapsed risk takes only the room it needs", () => {
  const extent = (l: FigureLayout) => {
    const xs = l.nodes.map((n) => n.position.x);
    const ys = l.nodes.map((n) => n.position.y);
    return {
      w: Math.max(...xs) + NODE_W - Math.min(...xs),
      h: Math.max(...ys) + NODE_H - Math.min(...ys),
    };
  };

  it("packs collapsed risks tightly instead of reserving a whole chain row", () => {
    const l = layoutFigure(view(), new Set());
    const gap = at(l, "risk1").y - at(l, "risk0").y;
    // a single box needs about one row, not the 2.5 rows an open chain needs
    expect(gap).toBeLessThan(NODE_H * 2);
    expect(gap).toBeGreaterThan(NODE_H);
  });

  it("opens at a readable size rather than needing a zoom", () => {
    // 2169px of height forced fitView to 0.43 on a 940px canvas, which
    // made everything tiny and centred.
    const { h } = extent(layoutFigure(view(), new Set()));
    expect(h).toBeLessThan(1000);
  });

  it("gives a risk its full chain row only once it is open", () => {
    const shut = layoutFigure(view(), new Set());
    const open = layoutFigure(view(), new Set(["risk0"]));
    const gapShut = at(shut, "risk1").y - at(shut, "risk0").y;
    const gapOpen = at(open, "risk1").y - at(open, "risk0").y;
    expect(gapOpen).toBeGreaterThan(gapShut);
  });

  it("pushes the risks below an opened one further down", () => {
    const shut = layoutFigure(view(), new Set());
    const open = layoutFigure(view(), new Set(["risk0"]));
    expect(at(open, "risk1").y).toBeGreaterThan(at(shut, "risk1").y);
    // and the one above it does not move
    expect(at(open, "risk0").y).toBe(at(shut, "risk0").y);
  });

  it("still never overlaps with one risk open and one shut", () => {
    const l = layoutFigure(view(), new Set(["risk0"]));
    const bad: string[] = [];
    for (let i = 0; i < l.nodes.length; i++) {
      for (let j = i + 1; j < l.nodes.length; j++) {
        const a = l.nodes[i].position;
        const b = l.nodes[j].position;
        if (Math.abs(a.x - b.x) < NODE_W && Math.abs(a.y - b.y) < NODE_H) {
          bad.push(`${l.nodes[i].id} / ${l.nodes[j].id}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("the risk band gives way to whatever the system band occupies", () => {
  it("pushes the risk band down when the components group is opened", () => {
    const shut = layoutFigure(view(), new Set());
    const open = layoutFigure(view(), new Set([hubId("hasComponent")]));
    // components grow downward from their slot, straight at the risk band
    expect(at(open, "risk0").y).toBeGreaterThan(at(shut, "risk0").y);
  });

  it("still never overlaps when a downward group and a risk are both open", () => {
    const l = layoutFigure(
      view(),
      new Set([hubId("hasComponent"), "risk0", "risk1"]),
    );
    const bad: string[] = [];
    for (let i = 0; i < l.nodes.length; i++) {
      for (let j = i + 1; j < l.nodes.length; j++) {
        const a = l.nodes[i].position;
        const b = l.nodes[j].position;
        if (Math.abs(a.x - b.x) < NODE_W && Math.abs(a.y - b.y) < NODE_H) {
          bad.push(`${l.nodes[i].id} / ${l.nodes[j].id}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("keeps an opened component in the system band, not the risk band", () => {
    // Band membership is a property of the node, not a y threshold: an opened
    // group can reach past where the boundary nominally sits.
    const l = layoutFigure(view(), new Set([hubId("hasComponent")]));
    expect(l.nodes.find((n) => n.id === "comp0")!.band).toBe("system");
    expect(l.nodes.find((n) => n.id === "risk0")!.band).toBe("risk");
    expect(l.bands).toHaveLength(2);
  });
});
