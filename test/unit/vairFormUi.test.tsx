// @vitest-environment jsdom
// The form speaks VAIR: one control per thing,
// VAIR's list wherever VAIR has one, ours only where it has none.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/app/p/[project]/qualify/new/prefill-actions", () => ({ readDocument: vi.fn() }));
vi.mock("@/app/p/[project]/qualify/new/actions", () => ({ submitQualification: vi.fn() }));

import QualifyForm from "@/app/p/[project]/qualify/new/QualifyForm";
import RiskRows from "@/app/p/[project]/qualify/new/RiskRows";
import ComponentRows from "@/app/p/[project]/qualify/new/ComponentRows";
import {
  CAPABILITIES,
  COMPONENT_TERMS,
  CONSEQUENCES,
  DOMAINS,
  IMPACT_AREAS,
  IMPACTS,
  LOCALITIES,
  MODALITIES,
  OPERATORS,
  PURPOSES,
  RISK_CONTROLS,
  RISK_SOURCES,
  SUBJECTS,
  SYSTEM_TYPES,
} from "@/data/vairVocab";
import { COMPONENT_TYPES } from "@/data/componentFields";

afterEach(cleanup);

const select = (name: string) => document.querySelector(`select[name="${name}"]`) as HTMLSelectElement | null;
const options = (name: string) =>
  [...(select(name)?.querySelectorAll("option") ?? [])].map((o) => o.value).filter(Boolean);
const hidden = (name: string) =>
  [...document.querySelectorAll(`input[type="hidden"][name="${name}"]`)].map((i) => (i as HTMLInputElement).value);
const chips = (field: string) =>
  [...document.querySelectorAll(`[data-field="${field}"] button.qf-chip`)].map((b) => b.textContent);

describe("the metadata", () => {
  it("offers VAIR's system types and purposes, one select each, both optional", () => {
    render(<QualifyForm project="p" />);
    expect(options("systemType")).toEqual(SYSTEM_TYPES.map((t) => t.id));
    expect(options("purpose")).toEqual(PURPOSES.map((t) => t.id));
    expect(select("systemType")!.required).toBe(false);
    expect(select("purpose")!.required).toBe(false);
  });

  it("offers VAIR's capabilities in one list, and adds the one picked", () => {
    render(<QualifyForm project="p" />);
    expect(options("targetSystemPick")).toEqual(CAPABILITIES.map((t) => t.id));
    fireEvent.change(select("targetSystemPick")!, { target: { value: "Profiling" } });
    expect(hidden("targetSystemTags")).toEqual(["Profiling"]);
    expect(options("targetSystemPick")).not.toContain("Profiling");
  });

  it.each([
    ["sectorTags", DOMAINS],
    ["marketFormTags", MODALITIES],
    ["localityTags", LOCALITIES],
  ] as const)("offers VAIR's %s as chips and nothing of ours", (field, list) => {
    render(<QualifyForm project="p" />);
    expect(chips(field)).toEqual(list.map((t) => t.label));
    fireEvent.click(screen.getByRole("button", { name: list[0].label }));
    expect(hidden(field)).toEqual([list[0].id]);
  });

  it("opens on a card's terms", () => {
    render(
      <QualifyForm
        project="p"
        initial={{
          metadata: {
            systemName: "MCAS", systemVersion: "1", company: "C", description: "", targetUseCase: "",
            targetUsers: "", intendedDeployers: "", systemType: "NarrowAI", purpose: "AssessingCreditworthiness",
            targetSystemTags: ["Profiling"], sectorTags: ["PrivateService"], marketFormTags: ["Software"],
            localityTags: ["Workplace"],
          },
          answers: {},
          risks: [],
        }}
      />,
    );
    expect(select("systemType")!.value).toBe("NarrowAI");
    expect(select("purpose")!.value).toBe("AssessingCreditworthiness");
    expect(hidden("targetSystemTags")).toEqual(["Profiling"]);
    expect(hidden("sectorTags")).toEqual(["PrivateService"]);
  });
});

describe("the people", () => {
  it("offers VAIR's operators for the provider and the deployer, both optional", () => {
    render(<QualifyForm project="p" />);
    for (const name of ["providerTerm", "deployerTerm"]) {
      expect(options(name)).toEqual(OPERATORS.map((t) => t.id));
      expect(select(name)!.required).toBe(false);
    }
  });

  it("asks who is affected in one select: VAIR's groups, then ours", () => {
    render(<RiskRows />);
    const groups = [...select("risk:0:affected")!.querySelectorAll("optgroup")];
    expect(groups.map((g) => g.label)).toEqual(["Standard groups", "Other groups"]);
    const ids = (g: Element) => [...g.querySelectorAll("option")].map((o) => o.value);
    expect(ids(groups[0])).toEqual(SUBJECTS.map((t) => t.id));
    expect(ids(groups[1])).toEqual(["operator", "user"]);
  });
});

describe("a risk row", () => {
  it.each([
    ["sourceTerm", RISK_SOURCES, true],
    ["consequenceTerm", CONSEQUENCES, false],
    ["impactTerm", IMPACTS, true],
    ["controlTerm", RISK_CONTROLS, true],
    ["followUpControlTerm", RISK_CONTROLS, false],
  ] as const)("has one VAIR select for %s", (field, list, required) => {
    render(<RiskRows />);
    expect(options(`risk:0:${field}`)).toEqual(list.map((t) => t.id));
    expect(select(`risk:0:${field}`)!.required).toBe(required);
  });

  it("keeps the text beside each select, and the harm has no text of its own", () => {
    render(<RiskRows />);
    for (const f of ["source", "consequence", "control", "followUpControl"]) {
      expect(document.querySelector(`textarea[name="risk:0:${f}"]`), f).not.toBeNull();
    }
    expect(document.querySelector('textarea[name="risk:0:impact"]')).toBeNull();
  });

  it("offers VAIR's areas of impact", () => {
    render(<RiskRows />);
    expect(chips("risk:0:area")).toEqual(IMPACT_AREAS.map((t) => t.label));
  });

  it("opens on a card's terms", () => {
    render(<RiskRows initial={[{
      risk: "r", source: "s", vulnerability: "", consequence: "c", affected: "user", areas: ["Right"],
      control: "k", followUpControl: "", sourceTerm: "DataPoisoning", consequenceTerm: "", impactTerm: "Harm",
      controlTerm: "SecurityMeasure", followUpControlTerm: "",
    }]} />);
    expect(select("risk:0:sourceTerm")!.value).toBe("DataPoisoning");
    expect(select("risk:0:impactTerm")!.value).toBe("Harm");
    expect(select("risk:0:consequenceTerm")!.value).toBe("");
    expect(hidden("risk:0:area")).toEqual(["Right"]);
  });
});

describe("a component row", () => {
  const row = { key: "", name: "Scoring model", role: "", type: "DecisionTree", provider: "in_house" as const, providerName: "" };

  it("has one Type select: VAIR's terms, then ours only for what VAIR lacks", () => {
    render(<ComponentRows initial={[row]} />);
    const groups = [...select("component:0:type")!.querySelectorAll("optgroup")];
    expect(groups.map((g) => g.label)).toEqual(["Standard types", "Other types"]);
    const ids = (g: Element) => [...g.querySelectorAll("option")].map((o) => o.value);
    expect(ids(groups[0])).toEqual(COMPONENT_TERMS.map((t) => t.id));
    expect(ids(groups[1])).toEqual(COMPONENT_TYPES.filter((t) => !t.vair).map((t) => t.id));
    expect(select("component:0:type")!.value).toBe("DecisionTree");
    expect(select("component:0:kind")).toBeNull();
  });
});

// The answered form on the card shows what was chosen, by VAIR's labels
import AnsweredForm from "@/app/p/[project]/qualify/[id]/AnsweredForm";

describe("the answered form", () => {
  const props = {
    metadata: {
      systemName: "MCAS", systemVersion: "1", company: "C", description: "d", targetUseCase: "u",
      targetUsers: "t", intendedDeployers: "b", systemType: "NarrowAI", purpose: "AssessingCreditworthiness",
      targetSystemTags: ["NaturalLanguageGeneration"], sectorTags: ["PrivateService"],
      marketFormTags: ["SafetyComponent"], localityTags: ["PubliclyAccessibleSpace"],
      providerTerm: null, deployerTerm: "EducationalInstitution",
    },
    answers: [],
    risks: [{
      id: "r1", risk: "r", source: "Thin bureau data", sourceTerm: "ErroneousInputData", vulnerability: null,
      consequence: "Refused", consequenceTerm: null, impactTerm: "UnfavourableTreatment", affected: "JobApplicant",
      impactAreas: ["RightToNondiscrimination"], control: "Review", controlTerm: "HumanOversightMeasure",
      followUpControl: null, followUpControlTerm: null,
    }],
    systemComponents: [{ id: "c1", name: "Scoring model", role: null, kind: "model", vairType: "DecisionTree",
                         provider: "in_house", providerName: null }],
  };

  it("names every VAIR choice by its label", () => {
    const { container } = render(<AnsweredForm {...props} />);
    const text = container.textContent ?? "";
    for (const label of ["Narrow AI", "Assessing Creditworthiness", "Natural Language Generation", "Private Service",
                         "Safety Component", "Publicly Accessible Space", "Right To Non-discrimination",
                         "Unfavourable Treatment", "Decision Tree", "Educational Institution", "Job Applicant"]) {
      expect(text, label).toContain(label);
    }
  });

  it("shows a field's text with its VAIR term beside it", () => {
    const { container } = render(<AnsweredForm {...props} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Thin bureau data");
    expect(text).toContain("Erroneous Input Data");
    expect(text).toContain("Human Oversight Measure");
  });
});

// The form never says "VAIR": the methodology page explains it, the form does not
describe("the word VAIR", () => {
  const named = (html: string) => html.match(/.{0,40}\bVAIR\b.{0,40}/g) ?? [];

  it("appears nowhere on the form, its risk rows or its component rows", () => {
    const { container } = render(
      <>
        <QualifyForm project="p" />
        <RiskRows />
        <ComponentRows initial={[{ key: "", name: "m", role: "", type: "DecisionTree", provider: "in_house", providerName: "" }]} />
      </>,
    );
    expect(named(container.innerHTML)).toEqual([]);
  });

  it("appears nowhere on the answered form", () => {
    const { container } = render(
      <AnsweredForm
        metadata={{ systemName: "S", systemVersion: "1", company: "C", description: "", targetUseCase: "",
                    targetUsers: "", intendedDeployers: "", systemType: "NarrowAI", purpose: null,
                    targetSystemTags: [], sectorTags: [], marketFormTags: [], localityTags: [] }}
        answers={[]}
        risks={[{ id: "r1", risk: "r", source: "Thin data", sourceTerm: "ErroneousInputData", vulnerability: null,
                  consequence: "", consequenceTerm: null, impactTerm: "Harm", affected: "user", impactAreas: [],
                  control: "Review", controlTerm: "HumanOversightMeasure", followUpControl: null,
                  followUpControlTerm: null }]}
        systemComponents={[]}
      />,
    );
    expect(named(container.innerHTML)).toEqual([]);
    expect(container.textContent).toContain("Thin data (Erroneous Input Data)");
  });
});
