// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import VerticalCard from "@/app/qualify/[id]/VerticalCard";
import type { OntologyView } from "@/domain/OntologyView";

afterEach(cleanup);

const node = (id: string, label: string, cls: string) => ({
  id,
  label,
  cls,
  vair: null,
  provenance: "form" as const,
  fullText: null,
});

const view: OntologyView = {
  system: node("system", "MicroCredit Assist Score", "AISystem"),
  answers: [],
  rows: [
    {
      property: "hasPurpose",
      label: "Purpose",
      citation: "Annex IV 1(a)",
      nodes: [node("purpose", "Score loan applications", "AIPurpose")],
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
      areas: [node("area_right", "Fundamental rights", "ImpactOnArea")],
    },
  ],
  counts: {
    nodes: 8,
    triples: 20,
    risks: 1,
    reviewed: 0,
    untyped: 0,
    flagged: 0,
    needsTerm: 0,
    unclassifiable: 0,
  },
};

function mount(over: Record<string, unknown> = {}) {
  return render(
    <VerticalCard
      view={view}
      vocabularies={{}}
      editing={null}
      pending={false}
      setEditing={vi.fn()}
      onSave={vi.fn()}
      {...over}
    />,
  );
}

describe("the vertical AI card", () => {
  it("reads top to bottom: the system's properties, then its risks", () => {
    render(<VerticalCard
      view={view}
      vocabularies={{}}
      editing={null}
      pending={false}
      setEditing={vi.fn()}
      onSave={vi.fn()}
    />);
    expect(screen.getByText("Purpose")).toBeTruthy();
    expect(screen.getByText("Score loan applications")).toBeTruthy();
    expect(
      screen.getByText("A creditworthy applicant is rejected"),
    ).toBeTruthy();
    expect(screen.getByText("Officer review")).toBeTruthy();
  });

});
