// The form speaks VAIR. One control per thing:
// wherever VAIR has a vocabulary for a field, the form offers only VAIR's terms; our own list only
// where VAIR has none. A VAIR field is required only where VAIR can always answer.
import { describe, expect, it } from "vitest";
import vocab from "@/data/vair_vocab.json";
import {
  CAPABILITIES,
  CONSEQUENCES,
  DOMAINS,
  IMPACT_AREAS,
  IMPACTS,
  LOCALITIES,
  MODALITIES,
  PURPOSES,
  RISK_CONTROLS,
  RISK_SOURCES,
  SYSTEM_TYPES,
  isVairTerm,
  vairLabel,
} from "@/data/vairVocab";
import { AFFECTED } from "@/data/airoVocab";
import {
  COMPONENT_TYPES,
  componentType,
  componentTypeLabel,
  typeToKind,
} from "@/data/componentFields";
import { FormValidationError, QualificationFormParser } from "@/server/forms/QualificationFormParser";
import { KEY_QUESTIONS, keyQuestionField } from "@/data/keyQuestions";

describe("the VAIR lists come from the generated file, whole", () => {
  it.each([
    ["AISystem", SYSTEM_TYPES],
    ["Purpose", PURPOSES],
    ["AICapability", CAPABILITIES],
    ["Domain", DOMAINS],
    ["Modality", MODALITIES],
    ["LocalityOfUse", LOCALITIES],
    ["RiskSource", RISK_SOURCES],
    ["Consequence", CONSEQUENCES],
    ["Impact", IMPACTS],
    ["AreaOfImpact", IMPACT_AREAS],
    ["RiskControl", RISK_CONTROLS],
  ] as const)("%s", (cls, list) => {
    const expected = (vocab.classes as Record<string, { id: string; label: string }[]>)[cls];
    expect(list.map((t) => t.id)).toEqual(expected.map((t) => t.id));
    expect(list.every((t) => t.label !== "")).toBe(true);
  });

  it("answers membership per class, not per namespace", () => {
    expect(isVairTerm("Domain", "PrivateService")).toBe(true);
    expect(isVairTerm("Domain", "Workplace")).toBe(false);
    expect(isVairTerm("Domain", "finance-and-insurance")).toBe(false);
    expect(vairLabel("AreaOfImpact", "RightToNondiscrimination")).toBe("Right To Non-discrimination");
  });

  it("keeps our own list only where VAIR has none: who is affected", () => {
    expect(AFFECTED.map((a) => a.id)).toEqual(["operator", "user"]);
  });
});

describe("a component's type is one list", () => {
  const ids = COMPONENT_TYPES.map((t) => t.id);

  it("offers every VAIR AIComponent term, then ours only for what VAIR has no term for", () => {
    const vair = vocab.classes.AIComponent.map((t) => t.id);
    expect(ids.slice(0, vair.length)).toEqual(vair);
    expect(ids.slice(vair.length)).toEqual([
      "llm", "rule_engine", "training_data", "validation_data", "other_data", "pipeline", "interface", "other",
    ]);
    expect(COMPONENT_TYPES.filter((t) => t.vair).length).toBe(vair.length);
  });

  it("our generic 'Predictive model' is gone: VAIR's Model terms are the models", () => {
    expect(ids).not.toContain("model");
    expect(typeToKind("DecisionTree")).toEqual({ kind: "model", vairType: "DecisionTree" });
    expect(typeToKind("TrainedModel")).toEqual({ kind: "model", vairType: "TrainedModel" });
  });

  it("any other VAIR term is of kind other; one of ours is its own kind with no term", () => {
    expect(typeToKind("NeuralNetwork")).toEqual({ kind: "other", vairType: "NeuralNetwork" });
    expect(typeToKind("llm")).toEqual({ kind: "llm", vairType: null });
    expect(typeToKind("other")).toEqual({ kind: "other", vairType: null });
    expect(typeToKind("model")).toBeNull();
    expect(typeToKind("Police")).toBeNull();
  });

  it("a stored row gives the type back, and the card shows its label", () => {
    expect(componentType("model", "DecisionTree")).toBe("DecisionTree");
    expect(componentType("training_data", null)).toBe("training_data");
    expect(componentTypeLabel("model", "DecisionTree")).toBe("Decision Tree");
    expect(componentTypeLabel("llm", null)).toBe("LLM or foundation model");
  });
});

function submittable(): FormData {
  const fd = new FormData();
  fd.set("systemName", "MCAS");
  fd.set("systemVersion", "1.2.0");
  fd.set("company", "Creditum AI SARL");
  fd.set("description", "Credit scoring.");
  fd.set("targetUseCase", "Scores consumer loan applications.");
  fd.set("targetUsers", "Applicants and loan officers.");
  fd.set("intendedDeployers", "Retail banks.");
  fd.set("systemType", "NarrowAI");
  fd.set("purpose", "AssessingCreditworthiness");
  fd.append("targetSystemTags", "Profiling");
  fd.append("sectorTags", "PrivateService");
  fd.append("marketFormTags", "Software");
  fd.append("localityTags", "Workplace");
  for (const q of KEY_QUESTIONS) {
    if (!q.optional) fd.set(keyQuestionField(q), `Answer for ${q.id}.`);
  }
  const risk: Record<string, string> = {
    risk: "An applicant is wrongly refused",
    source: "Thin bureau data",
    sourceTerm: "ErroneousInputData",
    consequence: "A creditworthy applicant is refused",
    consequenceTerm: "ImpairedDecisionMaking",
    impactTerm: "UnfavourableTreatment",
    affected: "user",
    control: "Human review of every rejection",
    controlTerm: "HumanOversightMeasure",
  };
  for (const [k, v] of Object.entries(risk)) fd.set(`risk:0:${k}`, v);
  fd.append("risk:0:area", "Right");
  fd.set("component:0:name", "Scoring model");
  fd.set("component:0:type", "DecisionTree");
  fd.set("component:0:provider", "in_house");
  return fd;
}

const parse = (fd: FormData) => new QualificationFormParser().parse(fd);

describe("the parser takes VAIR terms and nothing else where VAIR has the concept", () => {
  it("reads the provider's and the deployer's terms, both optional", () => {
    const fd = submittable();
    fd.set("providerTerm", "");
    fd.set("deployerTerm", "EducationalInstitution");
    const p = parse(fd);
    expect(p.providerTerm).toBeNull();
    expect(p.deployerTerm).toBe("EducationalInstitution");
  });

  it("refuses an operator term that is not an operator", () => {
    const fd = submittable();
    fd.set("deployerTerm", "JobApplicant");
    expect(() => parse(fd)).toThrow(/deployer/i);
  });

  it.each(["operator", "user", "JobApplicant"])("takes %s as who is affected", (value) => {
    const fd = submittable();
    fd.set("risk:0:affected", value);
    expect(parse(fd).risks[0].affected).toBe(value);
  });

  it("refuses an affected value that is neither ours nor a subject", () => {
    const fd = submittable();
    fd.set("risk:0:affected", "Police");
    expect(() => parse(fd)).toThrow(/who is affected/);
  });

  it("reads a whole VAIR form", () => {
    const p = parse(submittable());
    expect(p.systemType).toBe("NarrowAI");
    expect(p.purpose).toBe("AssessingCreditworthiness");
    expect(p.targetSystemTags).toEqual(["Profiling"]);
    expect(p.sectorTags).toEqual(["PrivateService"]);
    expect(p.marketFormTags).toEqual(["Software"]);
    expect(p.localityTags).toEqual(["Workplace"]);
    expect(p.risks[0]).toMatchObject({
      source: "Thin bureau data",
      sourceTerm: "ErroneousInputData",
      consequenceTerm: "ImpairedDecisionMaking",
      impactTerm: "UnfavourableTreatment",
      controlTerm: "HumanOversightMeasure",
      followUpControl: null,
      followUpControlTerm: null,
      impactAreas: ["Right"],
    });
    expect(p.systemComponents[0]).toMatchObject({ kind: "model", vairType: "DecisionTree" });
  });

  it.each([
    ["systemType", "Police", /system type/i],
    ["purpose", "Workplace", /purpose/i],
  ])("refuses %s %s", (field, value, message) => {
    const fd = submittable();
    fd.set(field, value);
    expect(() => parse(fd)).toThrow(FormValidationError);
    expect(() => parse(fd)).toThrow(message);
  });

  it("leaves system type and purpose optional: VAIR's lists do not cover every system", () => {
    const fd = submittable();
    fd.delete("systemType");
    fd.set("purpose", "");
    const p = parse(fd);
    expect(p.systemType).toBeNull();
    expect(p.purpose).toBeNull();
  });

  it.each([
    ["targetSystemTags", "natural-language-processing:question-answering"],
    ["sectorTags", "finance-and-insurance"],
    ["marketFormTags", "software"],
    ["localityTags", "other"],
    ["sectorTags", "Workplace"],
  ])("refuses the old or foreign %s value %s", (field, value) => {
    const fd = submittable();
    fd.append(field, value);
    expect(() => parse(fd)).toThrow(FormValidationError);
  });

  it("leaves capabilities, sectors and locality optional, market form required", () => {
    const fd = submittable();
    fd.delete("targetSystemTags");
    fd.delete("sectorTags");
    fd.delete("localityTags");
    const p = parse(fd);
    expect([p.targetSystemTags, p.sectorTags, p.localityTags]).toEqual([[], [], []]);
    fd.delete("marketFormTags");
    expect(() => parse(fd)).toThrow(/market form/);
  });

  it.each([
    ["sourceTerm", /What causes it: pick its term/],
    ["impactTerm", /harm: pick its term/i],
    ["controlTerm", /What you do about it: pick its term/],
  ])("requires %s, where VAIR always has a term", (field, message) => {
    const fd = submittable();
    fd.delete(`risk:0:${field}`);
    expect(() => parse(fd)).toThrow(message);
  });

  it("leaves the consequence's term optional: VAIR's seven do not cover every result", () => {
    const fd = submittable();
    fd.delete("risk:0:consequenceTerm");
    expect(parse(fd).risks[0].consequenceTerm).toBeNull();
  });

  it("asks for the follow-up's term exactly when there is a follow-up", () => {
    const fd = submittable();
    fd.set("risk:0:followUpControl", "Override with written justification");
    expect(() => parse(fd)).toThrow(/If that is not enough, what follows: pick its term/);
    fd.set("risk:0:followUpControlTerm", "OverridingOutcome");
    expect(parse(fd).risks[0].followUpControlTerm).toBe("OverridingOutcome");
  });

  it.each([
    ["sourceTerm", "Harm"],
    ["consequenceTerm", "Harm"],
    ["impactTerm", "Bias"],
    ["controlTerm", "DataPoisoning"],
  ])("refuses a %s of another class (%s)", (field, value) => {
    const fd = submittable();
    fd.set(`risk:0:${field}`, value);
    expect(() => parse(fd)).toThrow(FormValidationError);
  });

  it("never names VAIR in an error: the user reads it in the methodology, not on the form", () => {
    const fd = submittable();
    fd.set("risk:0:sourceTerm", "Harm");
    expect(() => parse(fd)).toThrow(/What causes it: Harm is not one of the terms for it/);
    fd.delete("risk:0:sourceTerm");
    expect(() => parse(fd)).not.toThrow(/VAIR/);
  });

  it("refuses an old area id", () => {
    const fd = submittable();
    fd.append("risk:0:area", "right");
    expect(() => parse(fd)).toThrow(/area of impact/);
  });

  it("derives kind and VAIR type from the one Type list, and refuses what is not on it", () => {
    const fd = submittable();
    fd.set("component:0:type", "llm");
    expect(parse(fd).systemComponents[0]).toMatchObject({ kind: "llm", vairType: null });
    fd.set("component:0:type", "model");
    expect(() => parse(fd)).toThrow(/Component 1: pick its type/);
  });
});

// The export the graph builder reads
import { toExport } from "@/server/services/QualificationExporter";
import type { QualificationWithAnswers } from "@/server/repositories/QualificationRepository";

function stored(): QualificationWithAnswers {
  return {
    id: "q1", projectId: "p", systemId: "s", systemName: "MCAS", systemVersion: "1.2.0", company: "Creditum",
    description: "d", targetUseCase: "u", targetUsers: "t", intendedDeployers: null,
    systemType: "NarrowAI", purpose: "AssessingCreditworthiness",
    targetSystemTags: ["Profiling", "bogus"], sectorTags: ["PrivateService", "finance-and-insurance"],
    marketFormTags: ["Software"], localityTags: ["Workplace", "other"],
    systemCard: null, systemCardJson: null, ontologyExtracted: null, ontologyPatch: null, ontologyAt: null,
    systemCardAt: null, systemCardPdfPath: null, createdAt: new Date(0), updatedAt: new Date(0),
    questionnaireVersionId: null, answers: [], components: [],
    risks: [{
      id: "r1", qualificationId: "q1", position: 0, risk: "R", source: "S", sourceTerm: "ErroneousInputData",
      vulnerability: null, consequence: "C", consequenceTerm: null, impactTerm: "Harm", affected: "user",
      impactAreas: ["Right"], control: "K", controlTerm: "MitigationMeasure", followUpControl: null,
      followUpControlTerm: null,
    }],
    systemComponents: [{
      id: "c1", qualificationId: "q1", position: 0, key: "k1", name: "Scoring model", role: null, kind: "model",
      vairType: "DecisionTree", provider: "in_house", providerName: null,
    }],
  } as unknown as QualificationWithAnswers;
}

describe("the export carries the author's VAIR terms to the builder", () => {
  it("passes the system type, the purpose and the tags as VAIR terms, dropping any that is not one", () => {
    const e = toExport(stored());
    expect(e).toMatchObject({
      systemType: "NarrowAI",
      purpose: "AssessingCreditworthiness",
      targetSystemTags: ["Profiling"],
      sectorTags: ["PrivateService"],
      marketFormTags: ["Software"],
      localityTags: ["Workplace"],
    });
    expect(e).not.toHaveProperty("targetSystems");
    expect(e).not.toHaveProperty("sectors");
  });

  it("passes each risk field's term and the component's VAIR type", () => {
    const e = toExport(stored());
    expect(e.risks[0]).toMatchObject({
      sourceTerm: "ErroneousInputData", consequenceTerm: null, impactTerm: "Harm",
      controlTerm: "MitigationMeasure", followUpControlTerm: null,
    });
    expect(e.systemComponents?.[0]).toMatchObject({ kind: "model", vairType: "DecisionTree" });
  });
});

// A card opens the next version's form with every term it was saved with
import { cardAsFormStart, type CardContent } from "@/domain/cardVersions";

describe("the next card starts from the terms this one was saved with", () => {
  const card = stored() as unknown as CardContent;

  it("carries the system type, the purpose and the tags", () => {
    const start = cardAsFormStart(card);
    expect(start.metadata).toMatchObject({
      systemType: "NarrowAI",
      purpose: "AssessingCreditworthiness",
      targetSystemTags: ["Profiling", "bogus"],
    });
  });

  it("carries the provider's and the deployer's terms, empty where the card had none", () => {
    const start = cardAsFormStart({ ...card, providerTerm: null, deployerTerm: "EducationalInstitution" } as CardContent);
    expect(start.metadata).toMatchObject({ providerTerm: "", deployerTerm: "EducationalInstitution" });
  });

  it("carries each risk field's term, empty where the card had none", () => {
    expect(cardAsFormStart(card).risks[0]).toMatchObject({
      sourceTerm: "ErroneousInputData",
      consequenceTerm: "",
      impactTerm: "Harm",
      controlTerm: "MitigationMeasure",
      followUpControlTerm: "",
    });
  });

  it("gives each component its one type", () => {
    expect(cardAsFormStart(card).components?.[0]).toMatchObject({ type: "DecisionTree" });
  });
});

// The PDF card's classification
import { systemCardPayload } from "@/domain/SystemCard";

describe("the PDF card names VAIR's capabilities and domains", () => {
  it("sends each capability as its VAIR label, with no category, and each domain by its label", () => {
    const p = systemCardPayload(
      { id: "q1", systemName: "MCAS", systemVersion: "1", company: "C", description: "d", targetUseCase: "u",
        targetUsers: "t", targetSystemTags: ["NaturalLanguageGeneration", "bogus"], sectorTags: ["PrivateService"] },
      null,
      null,
      new Date("2026-09-30T10:00:00Z"),
    );
    expect(p.classification).toEqual({
      target_systems: [{ subcategory: "Natural Language Generation" }],
      sectors: ["Private Service"],
    });
  });
});
