// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AnsweredForm, {
  type AnsweredFormProps,
} from "@/app/p/[project]/qualify/[id]/AnsweredForm";

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
    targetSystemTags: ["Profiling"],
    sectorTags: ["PrivateService"],
    marketFormTags: ["Service"],
    localityTags: ["Workplace"],
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
      impactAreas: ["Right"],
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
    // VAIR terms, shown by VAIR's labels
    expect(screen.queryByText("PrivateService")).toBeNull();
    expect(screen.getByText("Private Service")).toBeTruthy();
    expect(screen.getByText("Service")).toBeTruthy();
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

// The answered form walks the card's own form version
//
// AnsweredForm takes `form`, a ResolvedQuestionnaireVersion; without it the form is
// the default version (as in the cases above). A group's heading is `groupLabel ?? setName`.

import { customQuestion, formVersion, loadSrc, seededQuestion } from "../support/forms";

const acmeV2 = formVersion({
  versionId: "acme-v2",
  versionNumber: 2,
  blocks: [],
  questions: [
    customQuestion("acme", "q1", { text: "Wording as of v2?", citation: "Acme AI Policy §4.2" }),
    customQuestion("acme", "q2", { text: "Left blank here?", citation: "", required: false }),
  ],
});

const withForm = (form: unknown, over: Partial<AnsweredFormProps> = {}) =>
  ({ ...props(over), form }) as AnsweredFormProps;

describe("the answered form of a card filled with a custom form (R6, R36)", () => {
  const acmeAnswers = [
    { id: "x1", toolId: "f-acme", questionId: "q1", answer: "The head of data science." },
  ];

  it("R6 shows that version's questions and wording", () => {
    render(<AnsweredForm {...withForm(acmeV2, { answers: acmeAnswers })} />);
    expect(screen.getByText("Wording as of v2?")).toBeTruthy();
    expect(screen.getByText("The head of data science.")).toBeTruthy();
    expect(screen.queryByText(/If this version replaces an earlier one/)).toBeNull();
  });

  it("R36 an unanswered question of the version reads left blank", () => {
    const { container } = render(<AnsweredForm {...withForm(acmeV2, { answers: acmeAnswers })} />);
    const row = [...container.querySelectorAll(".qf-read-field")].find((r) =>
      r.querySelector("dt")?.textContent?.includes("Left blank here?"),
    )!;
    expect(row.querySelector("dd")!.textContent).toMatch(/left blank/i);
  });

  it("R36 renders the identity always, and no metadata, picker or risk section the form leaves out", () => {
    const { container } = render(<AnsweredForm {...withForm(acmeV2, { answers: acmeAnswers })} />);
    expect(screen.getByText("MicroCredit Assist Score (MCAS)")).toBeTruthy();
    expect(screen.getByText("Creditum AI SARL")).toBeTruthy();
    for (const hidden of [
      "Short description",
      "Target use case",
      "Intended deployers",
      "How the system reaches the market",
      "Where the system is used",
      "What could go wrong",
    ]) {
      expect(container.textContent, hidden).not.toContain(hidden);
    }
    expect(container.querySelector(".qf-risk-view")).toBeNull();
  });

  it("R36 renders a block the form includes", () => {
    const form = formVersion({ blocks: ["intendedDeployers", "risks"] as never, questions: [] });
    render(<AnsweredForm {...withForm(form, { answers: [] })} />);
    expect(screen.getByText("Retail banks in the EU.")).toBeTruthy();
    expect(screen.getByText("What could go wrong")).toBeTruthy();
    expect(screen.queryByText("Short description")).toBeNull();
  });

  it("R29 a free-text citation uses the same chip as an Annex citation; none when empty", () => {
    const { container } = render(<AnsweredForm {...withForm(acmeV2, { answers: acmeAnswers })} />);
    const dt = (text: string) =>
      [...container.querySelectorAll(".qf-read-field dt")].find((d) => d.textContent?.includes(text))!;
    expect(dt("Wording as of v2?").querySelector("span.qf-citation")?.textContent).toBe("Acme AI Policy §4.2");
    expect(dt("Left blank here?").querySelector("span.qf-citation")).toBeNull();
  });

  it("R36 groups questions as the qualification form does: group label, else owner form name", () => {
    const mixed = formVersion({
      questions: [seededQuestion("1a"), customQuestion("acme", "q1"), seededQuestion("2a")],
    });
    const { container } = render(<AnsweredForm {...withForm(mixed, { answers: [] })} />);
    expect([...container.querySelectorAll(".qf-group")].map((h) => h.textContent)).toEqual([
      "About the system",
      "Acme AI policy",
      "How the system was built",
    ]);
  });
});

describe("the answered form heads a run of questions by its question set (T40)", () => {
  it("T40 groupLabel, else the set's name, with a new heading whenever it changes", () => {
    const mixed = formVersion({
      questions: [
        customQuestion("acme", "q1", { setName: "Acme AI policy" }),
        customQuestion("gov", "q1", { setId: "gov", setName: "Governance checklist" }),
        customQuestion("gov", "q2", { setId: "gov", setName: "Governance checklist" }),
        seededQuestion("2a"),
      ],
    });
    const { container } = render(<AnsweredForm {...withForm(mixed, { answers: [] })} />);
    expect([...container.querySelectorAll(".qf-group")].map((h) => h.textContent)).toEqual([
      "Acme AI policy",
      "Governance checklist",
      "How the system was built",
    ]);
  });
});

describe("a legacy card reads back exactly as before (R7)", () => {
  it("R7 the default version renders the same output as no form at all", async () => {
    const { annexDefaultVersion } = await loadSrc("domain/forms/legacy.ts");
    const before = render(<AnsweredForm {...props()} />).container.innerHTML;
    cleanup();
    const after = render(<AnsweredForm {...withForm(annexDefaultVersion())} />).container.innerHTML;
    expect(after).toBe(before);
  });
});
