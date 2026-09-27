// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("@/app/p/[project]/qualify/new/prefill-actions", () => ({ readDocument: vi.fn() }));
vi.mock("@/app/p/[project]/qualify/new/actions", () => ({ submitQualification: vi.fn() }));

import QualifyForm from "@/app/p/[project]/qualify/new/QualifyForm";
import { findExample } from "@/data/examples";
import { sectors, targetSystems } from "@/data";
import { KEY_QUESTIONS, keyQuestionField } from "@/data/keyQuestions";
import { METADATA_FIELDS } from "@/data/formFields";
import {
  ALL_BLOCKS,
  customQuestion,
  defaultVersionLiteral,
  formVersion,
  seededQuestion,
} from "../support/forms";

// The qualification form renders from the resolved form version, not from
// KEY_QUESTIONS (form-assembly spec R9, R29). Prop `form: ResolvedFormVersion`
// replaces `keyQuestions`; when it is absent the form is the default version,
// so existing mounts (formPrefill.test.tsx, formUpload.test.tsx) keep working.

afterEach(cleanup);

const mount = (form: unknown, initial?: unknown) =>
  render(
    <QualifyForm
      project="mcas"
      {...({ form } as object)}
      targetSystems={targetSystems}
      sectors={sectors}
      initial={initial as never}
    />,
  );

const BLOCK_LABELS: Record<string, string> = {
  description: METADATA_FIELDS.description.label,
  targetUseCase: METADATA_FIELDS.targetUseCase.label,
  targetUsers: METADATA_FIELDS.targetUsers.label,
  intendedDeployers: METADATA_FIELDS.intendedDeployers.label,
  targetSystemTags: METADATA_FIELDS.targetSystemTags.label,
  sectorTags: METADATA_FIELDS.sectorTags.label,
  marketFormTags: METADATA_FIELDS.marketFormTags.label,
  localityTags: METADATA_FIELDS.localityTags.label,
};

const policy = formVersion({
  versionId: "acme-v2",
  versionNumber: 2,
  blocks: [],
  questions: [
    customQuestion("acme", "q1", { text: "Who signs off a model release?", citation: "Acme AI Policy §4.2" }),
    customQuestion("acme", "q2", { text: "How are incidents reported?", citation: "", required: false }),
  ],
});

const fieldNames = (c: HTMLElement) =>
  [...c.querySelectorAll("textarea")].map((t) => t.name).filter((n) => n.startsWith("q:"));
const headings = (c: HTMLElement) => [...c.querySelectorAll("h3.qf-group")].map((h) => h.textContent);

describe("a form with no blocks (R9)", () => {
  it("R9 R10 always renders the identity fields, required", () => {
    const { container } = mount(policy);
    for (const name of ["systemName", "systemVersion", "company"]) {
      const el = container.querySelector(`[name="${name}"]`) as HTMLInputElement;
      expect(el, name).toBeTruthy();
      expect(el.required, name).toBe(true);
    }
  });

  it("R9 renders no block that is not in form.blocks", () => {
    const { container } = mount(policy);
    for (const name of ["description", "targetUseCase", "targetUsers", "intendedDeployers"]) {
      expect(container.querySelector(`[name="${name}"]`), name).toBeNull();
    }
    for (const label of Object.values(BLOCK_LABELS)) {
      expect(container.textContent, label).not.toContain(label);
    }
    expect(container.querySelector("fieldset.qf-risk")).toBeNull();
  });

  it("R9 renders the version's questions, in order, named q:<scope>:<localId>", () => {
    const { container } = mount(policy);
    expect(fieldNames(container)).toEqual(["q:f-acme:q1", "q:f-acme:q2"]);
    const q1 = container.querySelector('[name="q:f-acme:q1"]') as HTMLTextAreaElement;
    const q2 = container.querySelector('[name="q:f-acme:q2"]') as HTMLTextAreaElement;
    expect(q1.required).toBe(true);
    expect(q2.required).toBe(false);
  });

  it('R9 marks a question that is not required "where applicable"', () => {
    const { container } = mount(policy);
    const label = (field: string) => container.querySelector(`label[for="${field}"]`)!;
    expect(label("q:f-acme:q2").textContent).toContain("where applicable");
    expect(label("q:f-acme:q1").textContent).not.toContain("where applicable");
  });

  it("R29 a free-text citation uses the Annex chip; an empty one has no chip", () => {
    const { container } = mount(policy);
    const label = (field: string) => container.querySelector(`label[for="${field}"]`)!;
    expect(label("q:f-acme:q1").querySelector("span.qf-citation")?.textContent).toBe("Acme AI Policy §4.2");
    expect(label("q:f-acme:q2").querySelector("span.qf-citation")).toBeNull();
  });

  it("R9 heads the questions with the set's name when they have no group label", () => {
    const { container } = mount(policy);
    expect(headings(container)).toEqual(["Acme AI policy"]);
  });

  it("R9 R15 carries the version id in a hidden questionnaireVersionId input", () => {
    const { container } = mount(policy);
    const hidden = container.querySelector('input[type="hidden"][name="questionnaireVersionId"]') as HTMLInputElement;
    expect(hidden?.value).toBe("acme-v2");
  });
});

describe("blocks one by one (R9)", () => {
  for (const block of ALL_BLOCKS) {
    it(`R9 the ${block} block renders when it is in form.blocks, and only then`, () => {
      const { container } = mount(formVersion({ blocks: [block] as never }));
      if (block === "risks") {
        expect(container.querySelector("fieldset.qf-risk")).toBeTruthy();
        return;
      }
      expect(container.textContent).toContain(BLOCK_LABELS[block]);
      for (const [other, label] of Object.entries(BLOCK_LABELS)) {
        if (other !== block) expect(container.textContent, label).not.toContain(label);
      }
      expect(container.querySelector("fieldset.qf-risk")).toBeNull();
    });
  }
});

describe("a mixed form (R9)", () => {
  it("R9 a heading appears wherever the heading value changes", () => {
    const mixed = formVersion({
      blocks: [],
      questions: [
        seededQuestion("1a"),
        seededQuestion("1b"),
        customQuestion("acme", "q1"),
        seededQuestion("2a"),
        customQuestion("gg", "q1", { setId: "gg", setName: "Governance checklist" }),
        customQuestion("gg", "q2", { setId: "gg", setName: "Governance checklist" }),
      ],
    });
    const { container } = mount(mixed);
    expect(headings(container)).toEqual([
      "About the system",
      "Acme AI policy",
      "How the system was built",
      "Governance checklist",
    ]);
    expect(fieldNames(container)).toEqual([
      "q:annex-1:1a",
      "q:annex-1:1b",
      "q:f-acme:q1",
      "q:annex-2:2a",
      "q:f-gg:q1",
      "q:f-gg:q2",
    ]);
  });
});

describe("the default version renders the form as it is today (R9, R7)", () => {
  it("R9 the same fields, names, order and headings as KEY_QUESTIONS", () => {
    const { container } = mount(defaultVersionLiteral());
    expect(fieldNames(container)).toEqual(KEY_QUESTIONS.map(keyQuestionField));
    expect(headings(container)).toEqual(["About the system", "How the system was built"]);
    for (const name of ["description", "targetUseCase", "targetUsers", "intendedDeployers"]) {
      expect(container.querySelector(`[name="${name}"]`), name).toBeTruthy();
    }
    expect(container.querySelector("fieldset.qf-risk")).toBeTruthy();
    expect(
      (container.querySelector('input[type="hidden"][name="questionnaireVersionId"]') as HTMLInputElement)?.value,
    ).toBe("annex-iv-default-v1");
  });

  it("R9 with no form prop it is the default version", () => {
    const { container } = mount(undefined);
    expect(fieldNames(container)).toEqual(KEY_QUESTIONS.map(keyQuestionField));
    expect(
      (container.querySelector('input[type="hidden"][name="questionnaireVersionId"]') as HTMLInputElement)?.value,
    ).toBe("annex-iv-default-v1");
  });
});

describe("starting from the previous card with another form (R9)", () => {
  it("R9 carries answers over for fields the chosen version has, and drops the rest", () => {
    const example = findExample("mcas")!;
    const initial = {
      ...example,
      answers: {
        ...example.answers,
        "q:f-acme:q1": "The head of data science.",
        "q:f-old:q9": "From a form not chosen now.",
      },
    };
    const { container } = mount(policy, initial);
    expect((container.querySelector('[name="q:f-acme:q1"]') as HTMLTextAreaElement).value).toBe(
      "The head of data science.",
    );
    expect(container.querySelector('[name="q:annex-1:1a"]')).toBeNull();
    expect(container.querySelector('[name="q:f-old:q9"]')).toBeNull();
    // the metadata of excluded blocks is not rendered, so it is not posted either
    expect(container.querySelector('[name="description"]')).toBeNull();
    expect(container.querySelectorAll('input[type="hidden"][name="sectorTags"]').length).toBe(0);
    // the identity is carried
    expect((container.querySelector('[name="systemName"]') as HTMLInputElement).value).toBe(
      example.metadata.systemName,
    );
  });
});
