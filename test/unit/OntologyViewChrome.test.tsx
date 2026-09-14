// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { cleanup, render } from "@testing-library/react";
import OntologyView from "@/app/qualify/[id]/OntologyView";
import type { OntologyView as View } from "@/domain/OntologyView";
import { installReactFlowEnv } from "../support/reactFlowEnv";

afterEach(cleanup);
beforeAll(installReactFlowEnv);

const node = (id: string, label: string, cls: string) => ({
  id,
  label,
  cls,
  vair: null,
  fullText: null,
  provenance: "form" as const,
});

const view: View = {
  system: node("system", "MicroCredit Assist Score", "AISystem"),
  answers: [],
  rows: [
    {
      property: "hasPurpose",
      label: "Purpose",
      citation: "Annex IV 1(a)",
      nodes: [node("purpose", "Score loan applications", "AIPurpose")],
    },
    {
      property: "hasCapability",
      label: "Capabilities",
      citation: "Art 3(1)",
      nodes: [
        node("cap0", "Risk scoring", "AICapability"),
        node("cap1", "Text generation", "AICapability"),
      ],
    },
  ],
  chains: [
    {
      citation: "Art 9(2)",
      risk: node("risk0", "A creditworthy applicant is rejected", "Risk"),
      source: node("risk0_source", "Postcode proxies", "RiskSource"),
      vulnerability: null,
      consequence: node("risk0_consequence", "Loss of credit access", "Consequence"),
      impact: node("risk0_impact", "Economic harm", "Impact"),
      stakeholder: node("user", "Applicants", "AIUser"),
      control: node("risk0_control", "Officer review", "RiskControl"),
      followUp: null,
      areas: [],
    },
  ],
  counts: {
    nodes: 9,
    triples: 24,
    risks: 1,
    reviewed: 0,
    untyped: 0,
    flagged: 0,
    needsTerm: 0,
    unclassifiable: 2,
  },
};

function mount() {
  return render(
    <OntologyView
      qualificationId="abc"
      initialView={view}
      initialProblems={[]}
      vocabularies={{}}
      downloads={{ pdf: "/p", json: "/j", jsonld: "/jl" }}
    />,
  );
}

describe("the card's chrome around the ontology", () => {
  it("carries no heading and no subtitle", () => {
    const { container } = mount();
    expect(container.textContent).not.toMatch(/filled AIRO graph/);
    expect(container.querySelector(".onto-head .qf-help")).toBeNull();
    expect(container.querySelector("section.onto h2")).toBeNull();
  });

  it("opens with one header: the downloads, then the view buttons", () => {
    const { container } = mount();
    const section = container.querySelector("section.onto")!;
    expect(section.firstElementChild!.className).toContain("onto-head");
    const head = section.querySelector(".onto-head")!;
    const children = [...head.children].map((c) => c.className);
    expect(children[0]).toContain("onto-downloads");
    expect(children[1]).toContain("onto-actions");
  });

  it("still offers both views", () => {
    const { container } = mount();
    const modes = [...container.querySelectorAll(".onto-modes button")].map(
      (b) => b.textContent,
    );
    expect(modes).toEqual(["Graph", "Vertical"]);
  });

  it("ends at the canvas: nothing is rendered below the ontology", () => {
    const { container } = mount();
    const section = container.querySelector("section.onto")!;
    const last = section.lastElementChild!;
    expect(last.className).toContain("onto-canvas");
    expect(section.querySelector(".onto-hint")).toBeNull();
  });

  it("keeps the fold-away control up in the header, not under the canvas", () => {
    const { container } = mount();
    // Nothing is open yet, so there is nothing to collapse.
    expect(container.querySelector(".onto-collapse-all")).toBeNull();
    const hub = container.querySelector(".react-flow__node")!;
    expect(hub).toBeTruthy();
  });
});
