// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import VerticalCard from "@/app/p/[project]/qualify/[id]/VerticalCard";
import type { OntologyView } from "@/domain/OntologyView";
import { readFileSync } from "node:fs";

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
      consequence: node(
        "risk0_consequence",
        "Loss of credit access",
        "Consequence",
      ),
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
    render(
      <VerticalCard
        view={view}
        vocabularies={{}}
        editing={null}
        pending={false}
        setEditing={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText("Purpose")).toBeTruthy();
    expect(screen.getByText("Score loan applications")).toBeTruthy();
    expect(
      screen.getByText("A creditworthy applicant is rejected"),
    ).toBeTruthy();
    expect(screen.getByText("Officer review")).toBeTruthy();
  });
});

// Coverage and "Additional documentation"
//
// The view has optional `form`, `coverage` and `additionalDocumentation`,
// computed by services/ontology (airo_min/coverage.py). A view without them
// renders exactly as above.

const coverage = {
  annex: { covered: 3, total: 14, points: [] },
  forms: [{ name: "Acme AI policy", answered: 18, total: 18 }],
  summary:
    "Annex IV coverage: 3 of 14 points; Acme AI policy: 18 of 18 answered.",
};
const additionalDocumentation = [
  {
    form: "Acme AI policy",
    entries: [
      {
        key: "f-acme:q2",
        question: "Who signs off a model release?",
        citation: "Acme AI Policy §4.2",
        answer: "The head of data science.",
      },
      {
        key: "f-acme:q3",
        question: "How are incidents reported?",
        citation: "",
        answer: "Through the risk desk.",
      },
    ],
  },
];

describe("the vertical AI card with a form (R36)", () => {
  it("R36 the coverage summary is the first line", () => {
    const { container } = mount({
      view: { ...view, coverage, form: { name: "Acme AI policy", version: 2 } },
    });
    const line = container.querySelector("p.qf-coverage");
    expect(line?.textContent).toBe(coverage.summary);
    // before anything else the card shows
    const first = container.firstElementChild;
    expect(first === line || first?.contains(line!)).toBe(true);
  });

  it('R36 one "Additional documentation: <form>" section after the risks, each entry question, chip and answer', () => {
    const { container } = mount({
      view: { ...view, coverage, additionalDocumentation },
    });
    const heads = [...container.querySelectorAll("h3.qf-group")].map(
      (h) => h.textContent,
    );
    expect(heads).toContain("Additional documentation: Acme AI policy");
    expect(
      heads.indexOf("Additional documentation: Acme AI policy"),
    ).toBeGreaterThan(heads.indexOf("Risks"));
    expect(screen.getByText("Who signs off a model release?")).toBeTruthy();
    expect(screen.getByText("The head of data science.")).toBeTruthy();
    expect(screen.getByText("Through the risk desk.")).toBeTruthy();
    const chips = [...container.querySelectorAll("span.qf-citation")].map(
      (s) => s.textContent,
    );
    // the free-text citation in the same chip as the Annex ones
    expect(chips).toContain("Acme AI Policy §4.2");
    expect(chips.filter((c) => c === "")).toEqual([]);
  });

  it("R36 no Risks heading when there are no chains, no About table when there are no rows", () => {
    const { container } = mount({
      view: {
        ...view,
        rows: [],
        chains: [],
        coverage,
        additionalDocumentation,
      },
    });
    const heads = [...container.querySelectorAll("h3.qf-group")].map(
      (h) => h.textContent,
    );
    expect(heads).not.toContain("Risks");
    expect(heads).not.toContain("About the system");
    expect(container.querySelector("table.onto-table")).toBeNull();
    expect(heads).toEqual(["Additional documentation: Acme AI policy"]);
  });

  it("T44 a section per question set, named after the set, entries as today", () => {
    const sets = [
      {
        form: "Governance checklist",
        entries: [
          {
            key: "s-gov:q1",
            question: "Who audits the model?",
            citation: "Gov §1",
            answer: "An outside firm.",
          },
        ],
      },
      {
        form: "Acme AI policy",
        entries: [
          {
            key: "s-acme:q1",
            question: "Which data?",
            citation: "",
            answer: "Loan outcomes.",
          },
        ],
      },
    ];
    const { container } = mount({
      view: {
        ...view,
        rows: [],
        chains: [],
        coverage,
        additionalDocumentation: sets,
      },
    });
    const heads = [...container.querySelectorAll("h3.qf-group")].map(
      (h) => h.textContent,
    );
    expect(heads).toEqual([
      "Additional documentation: Governance checklist",
      "Additional documentation: Acme AI policy",
    ]);
    expect(screen.getByText("Who audits the model?")).toBeTruthy();
    expect(screen.getByText("An outside firm.")).toBeTruthy();
    expect(screen.getByText("Loan outcomes.")).toBeTruthy();
  });

  it("R36 a view without coverage shows no coverage line and no extra sections", () => {
    const { container } = mount();
    expect(container.querySelector("p.qf-coverage")).toBeNull();
    const heads = [...container.querySelectorAll("h3.qf-group")].map(
      (h) => h.textContent,
    );
    expect(heads).toEqual(["About the system", "Risks"]);
  });
});

// A legacy card keeps the coverage line

describe("a legacy card (R66)", () => {
  it("R66 a legacy card with 1b, 1f, 2d and 2f blank shows the optional-left-blank coverage line", () => {
    const legacy = {
      annex: { covered: 10, total: 14, points: [], optionalBlank: 4 },
      forms: [],
      summary: "Annex IV coverage: 10 of 14 points (4 optional left blank).",
    };
    const { container } = mount({
      view: {
        ...view,
        coverage: legacy,
        form: { name: "Annex IV default", version: 1 },
      },
    });
    expect(container.querySelector("p.qf-coverage")?.textContent).toBe(
      "Annex IV coverage: 10 of 14 points (4 optional left blank).",
    );
  });

  it("R66 the TS Coverage type carries optionalBlank as an optional number", () => {
    const src = readFileSync("src/domain/OntologyView.ts", "utf8");
    expect(src).toMatch(/optionalBlank\?:\s*number/);
  });
});
