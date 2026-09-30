// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("@/app/p/[project]/qualify/new/prefill-actions", () => ({ readDocument: vi.fn() }));
vi.mock("@/app/p/[project]/qualify/new/actions", () => ({ submitQualification: vi.fn() }));

import QualifyForm from "@/app/p/[project]/qualify/new/QualifyForm";
import { findExample } from "@/data/examples";
import { customQuestion, formVersion, seededQuestion, setQuestion } from "../support/forms";

// Two-level forms T40 and T41 (docs/superpowers/two-level-forms-2026-09-25/01-spec.md):
// the card form renders the pinned wording of a questionnaire version, heads each run of
// questions by `groupLabel ?? setName`, posts `questionnaireVersionId`, and, when the card
// moves from the previous card's version P to another version V, says so and flags every
// reworded question whose carried answer is not blank.
//
// QualifyForm props used here: form (V), previous (P, resolved), cardNumber (the previous
// card's version number), initial (answers carried by field, cardAsFormStart unchanged).

afterEach(cleanup);

const example = findExample("mcas")!;

const mount = (props: Record<string, unknown>) =>
  render(
    <QualifyForm
      project="mcas"
      {...(props as object)}
    />,
  );

// P: Acme AI policy v1. V: Acme AI policy v2 (q1 reworded, q2 the same, q3 dropped, q4 new).
const q = (localId: string, text: string, v: number) =>
  setQuestion("acme", localId, { text, setVersionId: `acme-set-v${v}`, setVersionNumber: v });
const P = formVersion({
  questionnaireId: "acme", questionnaireName: "Acme AI policy", versionId: "acme-v1", versionNumber: 1,
  questions: [q("q1", "Who signs off?", 1), q("q2", "Which data?", 1), q("q3", "Dropped later?", 1)],
});
const V = formVersion({
  questionnaireId: "acme", questionnaireName: "Acme AI policy", versionId: "acme-v2", versionNumber: 2,
  questions: [q("q1", "Who signs off a release?", 2), q("q2", "Which data?", 2), q("q4", "Brand new?", 2)],
});

const withAnswers = (answers: Record<string, string>) => ({ ...example, answers });

const flags = (c: HTMLElement) => [...c.querySelectorAll("p.qf-wording-changed")];

describe("moving to another questionnaire version (T41)", () => {
  it("T41 the notice in p.qf-moving counts dropped answers and reworded questions", () => {
    const { container } = mount({
      form: V,
      previous: P,
      cardNumber: 4,
      initial: withAnswers({ "q:s-acme:q1": "The CTO.", "q:s-acme:q2": "Loans.", "q:s-acme:q3": "Old answer." }),
    });
    const notice = container.querySelectorAll("p.qf-moving");
    expect(notice).toHaveLength(1);
    expect(notice[0].textContent).toBe(
      "Moving from Acme AI policy v1 to Acme AI policy v2. Answers are carried over by question." +
        " 1 answer to a question this version does not ask will not be carried over." +
        " 1 reworded question is marked for review.",
    );
  });

  it("T41 under the label of each reworded question with a carried answer: Reworded since v<N>. Previous wording: <old>", () => {
    const { container } = mount({
      form: V,
      previous: P,
      cardNumber: 4,
      initial: withAnswers({ "q:s-acme:q1": "The CTO.", "q:s-acme:q2": "Loans." }),
    });
    const all = flags(container);
    expect(all).toHaveLength(1);
    expect(all[0].textContent).toBe("Reworded since v4. Previous wording: Who signs off?");
    const field = all[0].closest(".field")!;
    expect(field.querySelector("textarea")?.getAttribute("name")).toBe("q:s-acme:q1");
    // the answer itself is carried
    expect((container.querySelector('[name="q:s-acme:q1"]') as HTMLTextAreaElement).value).toBe("The CTO.");
  });

  it("T41 a reworded question whose carried answer is blank is not flagged, and not counted", () => {
    const { container } = mount({
      form: V,
      previous: P,
      cardNumber: 4,
      initial: withAnswers({ "q:s-acme:q1": "   ", "q:s-acme:q2": "Loans." }),
    });
    expect(flags(container)).toHaveLength(0);
    expect(container.querySelector("p.qf-moving")?.textContent).toBe(
      "Moving from Acme AI policy v1 to Acme AI policy v2. Answers are carried over by question.",
    );
  });

  it("T41 plural counts", () => {
    const P2 = formVersion({
      ...P,
      questions: [...P.questions, q("q5", "Also dropped?", 1), q("q4", "Old wording of four?", 1)],
    });
    const { container } = mount({
      form: V,
      previous: P2,
      cardNumber: 2,
      initial: withAnswers({
        "q:s-acme:q1": "a", "q:s-acme:q3": "b", "q:s-acme:q5": "c", "q:s-acme:q4": "d",
      }),
    });
    expect(container.querySelector("p.qf-moving")?.textContent).toBe(
      "Moving from Acme AI policy v1 to Acme AI policy v2. Answers are carried over by question." +
        " 2 answers to questions this version does not ask will not be carried over." +
        " 2 reworded questions are marked for review.",
    );
    expect(flags(container).map((f) => f.textContent)).toEqual([
      "Reworded since v2. Previous wording: Who signs off?",
      "Reworded since v2. Previous wording: Old wording of four?",
    ]);
  });

  it("T41 moving to another questionnaire names both and compares by (scope, localId)", () => {
    const annex = formVersion({
      questionnaireId: "annex-iv-default", questionnaireName: "Annex IV default", versionId: "annex-iv-default-v1",
      questions: [seededQuestion("1a"), seededQuestion("2a")],
    });
    const { container } = mount({
      form: annex,
      previous: V,
      cardNumber: 3,
      initial: withAnswers({ "q:annex-1:1a": "First release.", "q:s-acme:q1": "The CTO." }),
    });
    expect(container.querySelector("p.qf-moving")?.textContent).toBe(
      "Moving from Acme AI policy v2 to Annex IV default v1. Answers are carried over by question." +
        " 1 answer to a question this version does not ask will not be carried over.",
    );
    expect(flags(container)).toHaveLength(0);
  });

  it("T41 no previous version: no notice and no flag", () => {
    const { container } = mount({ form: V, initial: withAnswers({ "q:s-acme:q1": "The CTO." }) });
    expect(container.querySelector("p.qf-moving")).toBeNull();
    expect(flags(container)).toHaveLength(0);
  });

  it("T41 the previous version is the chosen one: no notice and no flag", () => {
    const { container } = mount({
      form: V,
      previous: V,
      cardNumber: 4,
      initial: withAnswers({ "q:s-acme:q1": "The CTO." }),
    });
    expect(container.querySelector("p.qf-moving")).toBeNull();
    expect(flags(container)).toHaveLength(0);
  });
});

describe("the card form renders the questionnaire version (T40)", () => {
  it("T40 heads each run of questions by groupLabel, else the set's name, a new heading when it changes", () => {
    const mixed = formVersion({
      questions: [
        seededQuestion("1a"),
        setQuestion("acme", "q1", { setName: "Acme AI policy" }),
        setQuestion("acme", "q2", { setName: "Acme AI policy" }),
        customQuestion("gov", "q1", { setId: "gov", setName: "Governance checklist" }),
        seededQuestion("2a"),
      ],
    });
    const { container } = mount({ form: mixed });
    expect([...container.querySelectorAll("h3.qf-group")].map((h) => h.textContent)).toEqual([
      "About the system",
      "Acme AI policy",
      "Governance checklist",
      "How the system was built",
    ]);
  });

  it("T40 renders the pinned wording, not another version's", () => {
    const { container } = mount({ form: P });
    const texts = [...container.querySelectorAll(".qf-question-text")].map((t) => t.textContent);
    expect(texts).toEqual(["Who signs off?", "Which data?", "Dropped later?"]);
  });

  it("T40 posts the version id in a hidden questionnaireVersionId input, and no formVersionId", () => {
    const { container } = mount({ form: V });
    const hidden = container.querySelector('input[type="hidden"][name="questionnaireVersionId"]') as HTMLInputElement;
    expect(hidden?.value).toBe("acme-v2");
    expect(container.querySelector('input[name="formVersionId"]')).toBeNull();
  });
});
