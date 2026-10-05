import type { FormBlock } from "@/domain/forms/blocks";
import { annexDefaultVersion } from "@/domain/forms/legacy";
import type {
  ResolvedQuestionnaireVersion,
  ResolvedQuestion,
} from "@/domain/forms/types";
import { isAffected } from "@/data/airoVocab";
import { isVairTerm, type VairClass } from "@/data/vairVocab";
import { RISK_FIELDS } from "@/data/riskFields";
import type { AnswerInput } from "@/server/repositories/QualificationRepository";
import { COMPONENT_NAME_MAX, typeToKind } from "@/data/componentFields";
import type { ComponentInput } from "@/domain/systemComponents";

// The identity: every form has it, whatever its blocks.
const IDENTITY_REQUIRED: Array<
  ["systemName" | "systemVersion" | "company", string]
> = [
  ["systemName", "System name is required"],
  ["systemVersion", "Version is required"],
  ["company", "Company is required"],
];

// The metadata text blocks, required when the form includes them. They are checked
// in this order, after the identity, so the first error message is always the same.
const TEXT_BLOCKS: Array<
  ["description" | "targetUseCase" | "targetUsers", string]
> = [
  ["description", "Description is required"],
  ["targetUseCase", "Target use case is required"],
  ["targetUsers", "Target users are required"],
];

/** One row of the risk block (question 15): one full AIRO risk chain. Each `...Term` is the VAIR
 *  term that types the field's node; the text beside it names the node. */
export type RiskInput = {
  position: number;
  risk: string;
  source: string;
  sourceTerm: string | null;
  vulnerability: string | null;
  consequence: string;
  consequenceTerm: string | null;
  impactTerm: string | null;
  affected: string;
  impactAreas: string[];
  control: string;
  controlTerm: string | null;
  followUpControl: string | null;
  followUpControlTerm: string | null;
};

/** A risk row's VAIR selects: the form field, its class, and whether VAIR can always answer it
 *  (then it is required; the follow-up's only when there is a follow-up). */
const RISK_TERMS: Array<{
  field:
    | "sourceTerm"
    | "consequenceTerm"
    | "impactTerm"
    | "controlTerm"
    | "followUpControlTerm";
  of: string;
  cls: VairClass;
  required: boolean;
}> = [
  { field: "sourceTerm", of: "source", cls: "RiskSource", required: true },
  {
    field: "consequenceTerm",
    of: "consequence",
    cls: "Consequence",
    required: false,
  },
  { field: "impactTerm", of: "impact", cls: "Impact", required: true },
  { field: "controlTerm", of: "control", cls: "RiskControl", required: true },
  {
    field: "followUpControlTerm",
    of: "followUpControl",
    cls: "RiskControl",
    required: true,
  },
];

const riskLabel = (id: string) =>
  RISK_FIELDS.find((f) => f.id === id)?.label ?? id;

// Required text fields of a risk row, with the label used in error messages.
const RISK_REQUIRED: Array<[keyof RiskInput, string]> = [
  ["risk", "What could go wrong"],
  ["source", "What causes it"],
  ["consequence", "What happens as a result"],
  ["control", "What you do about it"],
];

export type ParsedQualification = {
  systemName: string;
  systemVersion: string;
  company: string;
  /** "" when the form does not include the block. */
  description: string;
  targetUseCase: string;
  targetUsers: string;
  /** null when the form does not include the block. */
  intendedDeployers: string | null;
  /** VAIR AISystem and Purpose terms, on every form; null when left open. */
  systemType: string | null;
  purpose: string | null;
  /** VAIR AIOperator terms for the provider and the deployer; null when left open. */
  providerTerm: string | null;
  deployerTerm: string | null;
  /** VAIR terms: AICapability, Domain, Modality, LocalityOfUse. */
  targetSystemTags: string[];
  sectorTags: string[];
  marketFormTags: string[];
  localityTags: string[];
  answers: AnswerInput[];
  risks: RiskInput[];
  /** The Components block: on every card, whatever its questionnaire; keys are checked later. */
  systemComponents: ComponentInput[];
  /** The form version the submission was parsed against. */
  formVersionId: string;
};

export class FormValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormValidationError";
  }
}

export class QualificationFormParser {
  /**
   * The submission, read against the form version it was filled with. Only
   * that version's blocks and questions are read; anything else posted is
   * ignored. Without a form, the seeded default version.
   */
  parse(
    formData: FormData,
    form: ResolvedQuestionnaireVersion = annexDefaultVersion(),
  ): ParsedQualification {
    const has = (block: FormBlock) => form.blocks.includes(block);

    const identity = {
      systemName: this.trimmed(formData, "systemName"),
      systemVersion: this.trimmed(formData, "systemVersion"),
      company: this.trimmed(formData, "company"),
    };
    for (const [field, message] of IDENTITY_REQUIRED) {
      if (identity[field] === "") throw new FormValidationError(message);
    }
    const text = { description: "", targetUseCase: "", targetUsers: "" };
    for (const [field, message] of TEXT_BLOCKS) {
      if (!has(field)) continue;
      text[field] = this.trimmed(formData, field);
      if (text[field] === "") throw new FormValidationError(message);
    }
    let intendedDeployers: string | null = null;
    if (has("intendedDeployers")) {
      intendedDeployers = this.trimmed(formData, "intendedDeployers");
      if (intendedDeployers === "") {
        throw new FormValidationError("Intended deployers are required");
      }
    }

    // On every form, like the identity, and optional: VAIR's lists do not describe every system.
    const systemType = this.term(
      formData,
      "systemType",
      "AISystem",
      "system type",
    );
    const purpose = this.term(formData, "purpose", "Purpose", "purpose");
    const providerTerm = this.term(
      formData,
      "providerTerm",
      "AIOperator",
      "provider's term",
    );
    const deployerTerm = this.term(
      formData,
      "deployerTerm",
      "AIOperator",
      "deployer's term",
    );

    // The four tag sets are VAIR terms. Only market form is required: VAIR's four forms cover every
    // system, while its capabilities, domains and localities do not.
    const picked = (block: FormBlock) =>
      has(block) ? this.collectStrings(formData, block) : [];
    const tagSets: Array<[FormBlock, VairClass, string]> = [
      ["targetSystemTags", "AICapability", "capability"],
      ["sectorTags", "Domain", "sector"],
      ["marketFormTags", "Modality", "market form"],
      ["localityTags", "LocalityOfUse", "locality of use"],
    ];
    const tags = Object.fromEntries(
      tagSets.map(([block]) => [block, picked(block)]),
    ) as Record<string, string[]>;
    for (const [block, cls, name] of tagSets) {
      for (const t of tags[block]) {
        if (!isVairTerm(cls, t))
          throw new FormValidationError(`Unknown ${name}: ${t}`);
      }
    }
    if (has("marketFormTags") && tags.marketFormTags.length === 0) {
      throw new FormValidationError("Pick at least one market form.");
    }
    const { targetSystemTags, sectorTags, marketFormTags, localityTags } = tags;

    // A question marked optional ("where applicable" in Annex IV, or by the
    // form's author) may be left blank; the rest must be answered.
    const missing = form.questions.filter(
      (q) => q.required && this.trimmed(formData, q.field) === "",
    );
    if (missing.length > 0) {
      throw new FormValidationError(
        `Please answer all required questions (${missing.length} missing).`,
      );
    }

    // Only this version's questions are answers: a key from another form, or
    // one this version dropped, is ignored rather than stored.
    const byField = new Map<string, ResolvedQuestion>(
      form.questions.map((q) => [q.field, q]),
    );
    const answers: AnswerInput[] = [];
    // One answer per question: a field posted twice keeps its first value, as get() would. Two
    // would break the unique (tool, question) only after the card's version was made.
    const seen = new Set<string>();
    for (const [field, raw] of formData.entries()) {
      if (!field.startsWith("q:")) continue;
      if (typeof raw !== "string") continue;
      if (seen.has(field)) continue;
      seen.add(field);
      const value = raw.trim();
      if (!value) continue;
      const q = byField.get(field);
      if (!q) continue;
      answers.push({ toolId: q.scope, questionId: q.localId, answer: value });
    }

    const risks = has("risks") ? this.parseRisks(formData) : [];

    return {
      ...identity,
      ...text,
      intendedDeployers,
      systemType,
      purpose,
      providerTerm,
      deployerTerm,
      targetSystemTags,
      sectorTags,
      marketFormTags,
      localityTags,
      answers,
      risks,
      systemComponents: this.parseComponents(formData),
      formVersionId: form.versionId,
    };
  }

  /**
   * Component rows arrive as `component:<i>:<field>`, with `component:<i>:key` for a row carried
   * from the card before. Like risk rows: indices may have gaps, rows are renumbered by position,
   * and a row with every field blank is skipped.
   */
  private parseComponents(formData: FormData): ComponentInput[] {
    const indices = new Set<number>();
    for (const key of formData.keys()) {
      const m = /^component:(\d+):/.exec(key);
      if (m) indices.add(Number(m[1]));
    }
    const text = (i: number, f: string) =>
      this.trimmed(formData, `component:${i}:${f}`);
    const rows: ComponentInput[] = [];
    const names = new Set<string>();
    for (const i of [...indices].sort((a, b) => a - b)) {
      if (
        ["name", "role", "type", "providerName"].every((f) => text(i, f) === "")
      )
        continue;
      const n = rows.length + 1;
      const name = text(i, "name");
      if (name === "")
        throw new FormValidationError(`Component ${n}: its name is required.`);
      if (name.length > COMPONENT_NAME_MAX) {
        throw new FormValidationError(
          `Component ${n}: the name is at most ${COMPONENT_NAME_MAX} characters.`,
        );
      }
      const folded = name.toLowerCase().replace(/\s+/g, " ");
      if (names.has(folded))
        throw new FormValidationError(
          `Component ${n}: ${name} is already on the card.`,
        );
      names.add(folded);
      const typed = typeToKind(text(i, "type"));
      if (typed === null)
        throw new FormValidationError(`Component ${n}: pick its type.`);
      const provider =
        text(i, "provider") === "third_party" ? "third_party" : "in_house";
      const providerName = text(i, "providerName");
      if (provider === "third_party" && providerName === "") {
        throw new FormValidationError(
          `Component ${n}: name the third party that provides it.`,
        );
      }
      rows.push({
        position: rows.length,
        key: text(i, "key") || null,
        name,
        role: text(i, "role") || null,
        kind: typed.kind,
        vairType: typed.vairType,
        provider,
        providerName: provider === "third_party" ? providerName : null,
      });
    }
    return rows;
  }

  /**
   * Risk rows arrive as `risk:<i>:<field>` (and `risk:<i>:area`, repeated).
   * Row indices are the client's stable keys, so they may have gaps; rows are
   * renumbered by position. A row with every field blank is an unused trailing
   * row and is skipped.
   */
  private parseRisks(formData: FormData): RiskInput[] {
    const indices = new Set<number>();
    for (const key of formData.keys()) {
      const m = /^risk:(\d+):/.exec(key);
      if (m) indices.add(Number(m[1]));
    }
    const text = (i: number, f: string) =>
      this.trimmed(formData, `risk:${i}:${f}`);

    const rows: RiskInput[] = [];
    for (const i of [...indices].sort((a, b) => a - b)) {
      const areas = this.collectStrings(formData, `risk:${i}:area`);
      const allBlank =
        RISK_REQUIRED.every(([f]) => text(i, f) === "") &&
        text(i, "vulnerability") === "" &&
        text(i, "followUpControl") === "" &&
        RISK_TERMS.every(({ field }) => text(i, field) === "") &&
        areas.length === 0;
      if (allBlank) continue;

      const n = rows.length + 1;
      for (const [f, label] of RISK_REQUIRED) {
        if (text(i, f) === "") {
          throw new FormValidationError(`Risk ${n}: ${label} is required.`);
        }
      }
      const affected = text(i, "affected");
      if (!isAffected(affected)) {
        throw new FormValidationError(
          `Risk ${n}: who is affected is not one of the listed groups.`,
        );
      }
      if (areas.length === 0) {
        throw new FormValidationError(
          `Risk ${n}: pick at least one area of impact.`,
        );
      }
      for (const a of areas) {
        if (!isVairTerm("AreaOfImpact", a)) {
          throw new FormValidationError(
            `Risk ${n}: unknown area of impact: ${a}`,
          );
        }
      }
      const terms: Record<string, string | null> = {};
      for (const { field, of, cls, required } of RISK_TERMS) {
        const value = text(i, field);
        const asked = of !== "followUpControl" || text(i, of) !== "";
        if (value === "") {
          if (required && asked) {
            throw new FormValidationError(
              `Risk ${n}: ${riskLabel(of)}: pick its term.`,
            );
          }
          terms[field] = null;
          continue;
        }
        if (!asked || !isVairTerm(cls, value)) {
          throw new FormValidationError(
            `Risk ${n}: ${riskLabel(of)}: ${value} is not one of the terms for it.`,
          );
        }
        terms[field] = value;
      }
      rows.push({
        position: rows.length,
        risk: text(i, "risk"),
        source: text(i, "source"),
        sourceTerm: terms.sourceTerm,
        vulnerability: text(i, "vulnerability") || null,
        consequence: text(i, "consequence"),
        consequenceTerm: terms.consequenceTerm,
        impactTerm: terms.impactTerm,
        affected,
        impactAreas: areas,
        control: text(i, "control"),
        controlTerm: terms.controlTerm,
        followUpControl: text(i, "followUpControl") || null,
        followUpControlTerm: terms.followUpControlTerm,
      });
    }
    if (rows.length === 0) {
      throw new FormValidationError("Add at least one risk.");
    }
    return rows;
  }

  /** An optional single VAIR select: null when left open, refused when not a term of its class. */
  private term(
    formData: FormData,
    name: string,
    cls: VairClass,
    what: string,
  ): string | null {
    const value = this.trimmed(formData, name);
    if (value === "") return null;
    if (!isVairTerm(cls, value))
      throw new FormValidationError(`Unknown ${what}: ${value}`);
    return value;
  }

  private trimmed(formData: FormData, name: string): string {
    const v = formData.get(name);
    return typeof v === "string" ? v.trim() : "";
  }

  private collectStrings(formData: FormData, name: string): string[] {
    return formData
      .getAll(name)
      .map((v) => (typeof v === "string" ? v : ""))
      .filter(Boolean);
  }
}

export const qualificationFormParser = new QualificationFormParser();
