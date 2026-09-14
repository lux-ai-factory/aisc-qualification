// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AnsweredForm, {
  type AnsweredFormProps,
} from "@/app/qualify/[id]/AnsweredForm";

afterEach(cleanup);

const props = (over: Partial<AnsweredFormProps> = {}): AnsweredFormProps => ({
  metadata: {
    systemName: "MicroCredit Assist Score (MCAS)",
    systemVersion: "v1.2.0",
    company: "Creditum AI SARL",
    description: "Scores consumer loan applications.",
    targetUseCase: "Pre-screening consumer loan applications.",
    targetUsers: "Loan officers; applicants.",
    intendedDeployers: "Retail banks in the EU.",
    targetSystemTags: ["predictive-analytical-ai:risk-scoring-assessment"],
    sectorTags: ["economy"],
    marketFormTags: ["service"],
    localityTags: ["workplace"],
  },
  answers: [
    {
      id: "a1",
      toolId: "annex-1",
      questionId: "1a",
      answer: "First release; no earlier version.",
    },
    {
      id: "a2",
      toolId: "annex-2",
      questionId: "2a",
      answer: "Gradient boosting on 40 features.",
    },
  ],
  risks: [
    {
      id: "r1",
      risk: "A creditworthy applicant is rejected.",
      source: "Proxy variables correlated with postcode.",
      vulnerability: null,
      consequence: "The applicant loses access to credit.",
      affected: "user",
      impactAreas: ["right"],
      control: "A loan officer reviews every rejection.",
      followUpControl: null,
    },
  ],
  ...over,
});

describe("the answered form, read back", () => {
  it("shows every metadata field with its label and citation", () => {
    render(<AnsweredForm {...props()} />);
    expect(screen.getByText("Intended deployers")).toBeTruthy();
    expect(screen.getByText("Retail banks in the EU.")).toBeTruthy();
    // the citation travels with the label, as on the form itself
    expect(screen.getByText("Art 3(4); Annex IV 1(h)")).toBeTruthy();
  });

  it("renders the pickers as their labels, not their codes", () => {
    render(<AnsweredForm {...props()} />);
    expect(screen.queryByText("service")).toBeNull();
    expect(screen.getByText(/Service \(online service or API\)/)).toBeTruthy();
    expect(screen.getByText(/Economy/)).toBeTruthy();
  });

  it("lays every section out the way the metadata is laid out", () => {
    const { container } = render(<AnsweredForm {...props()} />);
    // One pattern for the whole form: a list of label/value rows, where the
    // label carries the AI Act citation. No boxed panels, no second grid.
    const lists = container.querySelectorAll("dl.qf-read-list");
    // the metadata, the two question groups, and the one risk
    expect(lists.length).toBe(4);
    for (const list of lists) {
      expect(list.querySelectorAll(":scope > .qf-read-field").length).toBeGreaterThan(0);
    }
    expect(container.querySelector(".qf-answer")).toBeNull();
    expect(container.querySelector(".qf-answer-q")).toBeNull();
  });

  it("puts each question in the label column and its answer beside it", () => {
    const { container } = render(<AnsweredForm {...props()} />);
    const row = [...container.querySelectorAll(".qf-read-field")].find((r) =>
      r.querySelector("dt")?.textContent?.includes("If this version replaces"),
    )!;
    expect(row).toBeTruthy();
    expect(row.querySelector("dt")!.textContent).toContain("Annex IV(1)(a)");
    expect(row.querySelector("dd")!.textContent).toBe(
      "First release; no earlier version.",
    );
  });

  it("shows each answer under its question and Annex IV citation", () => {
    render(<AnsweredForm {...props()} />);
    expect(screen.getByText("Annex IV(1)(a)")).toBeTruthy();
    expect(
      screen.getByText(/If this version replaces an earlier one/),
    ).toBeTruthy();
    expect(screen.getByText("First release; no earlier version.")).toBeTruthy();
  });

  it("groups the answers the way the form groups them", () => {
    const { container } = render(<AnsweredForm {...props()} />);
    const groups = [...container.querySelectorAll(".qf-group")].map(
      (h) => h.textContent,
    );
    expect(groups).toContain("About the system");
    expect(groups).toContain("How the system was built");
  });

  it("shows each risk field with its own citation", () => {
    render(<AnsweredForm {...props()} />);
    expect(screen.getByText("What could go wrong")).toBeTruthy();
    expect(screen.getByText("Art 9(2)(a); Art 3(2)")).toBeTruthy();
    expect(
      screen.getByText("A loan officer reviews every rejection."),
    ).toBeTruthy();
  });

  it("leaves out the optional risk fields that were left blank", () => {
    render(<AnsweredForm {...props()} />);
    expect(
      screen.queryByText("Which weakness in the system makes it possible"),
    ).toBeNull();
    expect(
      screen.queryByText("If that is not enough, what follows"),
    ).toBeNull();
  });

  it("opens straight into the fields: the tab already says what this is", () => {
    const { container } = render(<AnsweredForm {...props()} />);
    expect(container.textContent).not.toMatch(/^The system/);
    const headings = [...container.querySelectorAll("h2")].map(
      (h) => h.textContent,
    );
    expect(headings).not.toContain("The system");
    // the question groups keep their headings; they name real sections
    expect(headings).toContain("About the system");
  });

  it("is read-only: nothing on it can be typed into or submitted", () => {
    const { container } = render(<AnsweredForm {...props()} />);
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });

  it("says an optional question was left blank rather than dropping it silently", () => {
    render(<AnsweredForm {...props({ answers: [] })} />);
    expect(screen.getAllByText(/left blank/i).length).toBeGreaterThan(0);
  });
});
