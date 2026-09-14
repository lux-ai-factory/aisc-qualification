// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";

import OntologyGraph from "@/app/qualify/[id]/OntologyGraph";
import { installReactFlowEnv } from "../support/reactFlowEnv";
import { hubId } from "@/domain/ontologyFigure";
import type { OntologyNode, OntologyView } from "@/domain/OntologyView";

afterEach(cleanup);

beforeAll(installReactFlowEnv);

const n = (id: string, cls: string): OntologyNode => ({
  id,
  label: id,
  cls,
  vair: null,
  fullText: null,
  provenance: "form",
});

function view(): OntologyView {
  return {
    system: n("system", "AISystem"),
    answers: [],
    rows: [
      {
        property: "hasPurpose",
        label: "Purpose",
        citation: "Art 3(12)",
        nodes: [n("purpose", "Purpose")],
      },
      {
        property: "hasCapability",
        label: "Capabilities",
        citation: "Art 3(1)",
        nodes: [
          n("capability0", "AICapability"),
          n("capability1", "AICapability"),
        ],
      },
    ],
    chains: [
      {
        risk: n("risk0", "Risk"),
        source: n("risk0_source", "RiskSource"),
        vulnerability: null,
        consequence: n("risk0_consequence", "Consequence"),
        impact: n("risk0_impact", "Impact"),
        stakeholder: n("users", "AIUser"),
        areas: [n("area_right", "AreaOfImpact")],
        control: n("risk0_control", "RiskControl"),
        followUp: null,
        citation: "Art 9(2)",
      },
    ],
    counts: {
      nodes: 8,
      triples: 40,
      risks: 1,
      reviewed: 0,
      untyped: 0,
      flagged: 0,
      needsTerm: 0,
      unclassifiable: 0,
    },
  };
}

function mount(expanded = new Set<string>(), onToggle = vi.fn()) {
  const r = render(
    <ReactFlowProvider>
      <OntologyGraph
        view={view()}
        vocabularies={{ Purpose: ["Assessment"], AICapability: ["Profiling"] }}
        editing={null}
        setEditing={vi.fn()}
        expanded={expanded}
        onToggleExpand={onToggle}
      />
    </ReactFlowProvider>,
  );
  return { ...r, onToggle };
}

// Edge *painting* is not asserted here on purpose: React Flow only paints an
// edge after measuring both endpoints from the DOM, which jsdom cannot do
// faithfully, so such an assertion tests the stub rather than the component.
// The 8 edges, their endpoints, labels and true AIRO direction are covered by
// ontologyFigure.test.ts; the handle regression below is the part that actually
// broke in a browser.
describe("OntologyGraph, Figure 3 bands and collapsible groups", () => {
  it("opens with the system, its slots and the risks, not every node", () => {
    const { container } = mount();
    const rendered = container.querySelectorAll(".react-flow__node");
    // system + purpose + capability hub + risk0 = 4
    expect(rendered).toHaveLength(4);
    expect(container.textContent).not.toContain("capability0");
    expect(container.textContent).not.toContain("risk0_source");
  });

  it("shows a collapsed group as a hub with its label and count", () => {
    mount();
    expect(screen.getByText("Capabilities")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("reveals a group's members once it is expanded", () => {
    const { container } = mount(new Set([hubId("hasCapability")]));
    expect(container.querySelectorAll(".react-flow__node")).toHaveLength(6);
    expect(container.textContent).toContain("capability0");
  });

  it("reveals a risk's chain once the risk is expanded", () => {
    const { container } = mount(new Set(["risk0"]));
    expect(container.textContent).toContain("risk0_source");
    expect(container.textContent).toContain("risk0_control");
  });

  it("asks the page to toggle when a hub is clicked", () => {
    const { container, onToggle } = mount();
    const hub = container.querySelector(".onto-hub") as HTMLElement;
    expect(hub).toBeTruthy();
    hub.click();
    expect(onToggle).toHaveBeenCalledWith(hubId("hasCapability"));
  });

  it("offers an expander on a node that has hidden children", () => {
    const { container, onToggle } = mount();
    const expander = container.querySelector(
      '[data-testid="expand-risk0"]',
    ) as HTMLElement;
    expect(expander).toBeTruthy();
    expander.click();
    expect(onToggle).toHaveBeenCalledWith("risk0");
  });

  it("offers no expander on a leaf", () => {
    const { container } = mount();
    expect(
      container.querySelector('[data-testid="expand-purpose"]'),
    ).toBeNull();
  });

  /**
   * Regression. React Flow anchors every edge to a source handle and a target
   * handle inside the node; a custom node rendering no <Handle> gives edges
   * nowhere to attach and none of them draw. That was the "I see no edges" bug.
   */
  it("gives every node both a source and a target handle", () => {
    const { container } = mount(new Set(["risk0"]));
    const rendered = container.querySelectorAll(".react-flow__node");
    expect(rendered.length).toBeGreaterThan(0);
    for (const node of rendered) {
      expect(
        node.querySelector(".react-flow__handle-right, .source"),
        `node ${node.getAttribute("data-id")} has no source handle`,
      ).toBeTruthy();
      expect(
        node.querySelector(".react-flow__handle-left, .target"),
        `node ${node.getAttribute("data-id")} has no target handle`,
      ).toBeTruthy();
    }
  });

  /**
   * The two dashed frames live in a ViewportPortal so they pan and zoom with
   * the nodes. A portal mounts client-side only, so the server HTML omits them:
   * jsdom is where this can be checked at all.
   */
  it("draws the figure's two labelled bands", () => {
    const { container } = mount(new Set(["risk0"]));
    const bands = container.querySelectorAll(".onto-band");
    expect(bands).toHaveLength(2);
    const labels = [...container.querySelectorAll(".onto-band-label")].map(
      (e) => e.textContent,
    );
    expect(labels).toEqual([
      "Concepts regarding AI system and its use",
      "Concepts regarding risk",
    ]);
  });

  it("separates the two bands vertically, system above risk", () => {
    const { container } = mount(new Set(["risk0"]));
    const ys = [...container.querySelectorAll(".onto-band")].map((b) => {
      const t = (b as HTMLElement).style.transform;
      return Number(/translate\((-?[\d.]+)px, *(-?[\d.]+)px\)/.exec(t)![2]);
    });
    expect(ys[0]).toBeLessThan(ys[1]);
  });

  /**
   * React Flow renders a ViewportPortal as the LAST child of the viewport,
   * after the edges and the nodes, so anything in it paints on top. A band with
   * a translucent fill therefore acted as a grey sheet over the whole graph.
   * The frames must sit behind the graph, and must not paint a fill at all.
   */
  it("puts the band frames behind the edges and nodes", () => {
    const { container } = mount(new Set(["risk0"]));
    const viewport = container.querySelector(".react-flow__viewport")!;
    const order = [...viewport.children].map(
      (c) =>
        (typeof c.className === "string" ? c.className : "") ||
        (c as SVGElement).className?.baseVal ||
        "",
    );
    // the portal really is painted last, which is why z-index is required
    expect(order[order.length - 1]).toContain("viewport-portal");

    for (const band of container.querySelectorAll(".onto-band")) {
      const z = Number((band as HTMLElement).style.zIndex);
      expect(z, "band frame must sit behind the graph").toBeLessThan(0);
    }
  });

  it("gives the band frames no fill, so nothing is seen through a tint", () => {
    const { container } = mount(new Set(["risk0"]));
    for (const band of container.querySelectorAll(".onto-band")) {
      const bg = (band as HTMLElement).style.background;
      const bgc = (band as HTMLElement).style.backgroundColor;
      expect(`${bg}${bgc}`, "band frame must not paint a fill").toBe("");
    }
  });
});
