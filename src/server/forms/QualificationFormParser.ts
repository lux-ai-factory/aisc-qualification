import { TaxonomyService, taxonomyService } from "@/domain/Taxonomy";
import type { FormBlock } from "@/domain/forms/blocks";
import { annexDefaultVersion } from "@/domain/forms/legacy";
import type { ResolvedQuestionnaireVersion, ResolvedQuestion } from "@/domain/forms/types";
import {
  isAffected,
  isImpactArea,
  isLocality,
  isMarketForm,
} from "@/data/airoVocab";
import type { AnswerInput } from "@/server/repositories/QualificationRepository";
import { COMPONENT_NAME_MAX, isComponentKind } from "@/data/componentFields";
import type { ComponentInput } from "@/domain/systemComponents";

// The identity: every form has it, whatever its blocks.
const IDENTITY_REQUIRED: Array<["systemName" | "systemVersion" | "company", string]> = [
  ["systemName", "System name is required"],
  ["systemVersion", "Version is required"],
  ["company", "Company is required"],
];

// The metadata text blocks, required when the form includes them. Checked in
// this order, after the identity, so the first message is the one it always was.
const TEXT_BLOCKS: Array<["description" | "targetUseCase" | "targetUsers", string]> = [
  ["description", "Description is required"],
  ["targetUseCase", "Target use case is required"],
  ["targetUsers", "Target users are required"],
];

/** One row of the risk block (question 15): one full AIRO risk chain. */
export type RiskInput = {
  position: number;
  risk: string;
  source: string;
  vulnerability: string | null;
  consequence: string;
  affected: "operator" | "user";
  impactAreas: string[];
  control: string;
  followUpControl: string | null;
};

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
  constructor(private readonly taxonomy: TaxonomyService = taxonomyService) {}

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

    const picked = (block: FormBlock) =>
      has(block) ? this.collectStrings(formData, block) : [];

    const targetSystemTags = picked("targetSystemTags");
    const sectorTags = picked("sectorTags");
    if (has("targetSystemTags") && targetSystemTags.length === 0) {
      throw new FormValidationError(
        "Pick at least one target-system capability.",
      );
    }
    if (has("sectorTags") && sectorTags.length === 0) {
      throw new FormValidationError("Pick at least one sector.");
    }
    for (const t of targetSystemTags) {
      if (!this.taxonomy.isValidTargetSystemTag(t)) {
        throw new FormValidationError(`Unknown target system tag: ${t}`);
      }
    }
    for (const s of sectorTags) {
      if (!this.taxonomy.isValidSectorTag(s)) {
        throw new FormValidationError(`Unknown sector: ${s}`);
      }
    }

    // AIRO-aligned pickers: controlled ids from src/data/airo_vocab.json.
    const marketFormTags = picked("marketFormTags");
    const localityTags = picked("localityTags");
    if (has("marketFormTags") && marketFormTags.length === 0) {
      throw new FormValidationError("Pick at least one market form.");
    }
    if (has("localityTags") && localityTags.length === 0) {
      throw new FormValidationError("Pick at least one locality of use.");
    }
    for (const m of marketFormTags) {
      if (!isMarketForm(m)) {
        throw new FormValidationError(`Unknown market form: ${m}`);
      }
    }
    for (const l of localityTags) {
      if (!isLocality(l)) {
        throw new FormValidationError(`Unknown locality: ${l}`);
      }
    }

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
    for (const [field, raw] of formData.entries()) {
      if (!field.startsWith("q:")) continue;
      if (typeof raw !== "string") continue;
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
    const text = (i: number, f: string) => this.trimmed(formData, `component:${i}:${f}`);
    const rows: ComponentInput[] = [];
    const names = new Set<string>();
    for (const i of [...indices].sort((a, b) => a - b)) {
      if (["name", "role", "kind", "providerName"].every((f) => text(i, f) === "")) continue;
      const n = rows.length + 1;
      const name = text(i, "name");
      if (name === "") throw new FormValidationError(`Component ${n}: its name is required.`);
      if (name.length > COMPONENT_NAME_MAX) {
        throw new FormValidationError(`Component ${n}: the name is at most ${COMPONENT_NAME_MAX} characters.`);
      }
      const folded = name.toLowerCase().replace(/\s+/g, " ");
      if (names.has(folded)) throw new FormValidationError(`Component ${n}: ${name} is already on the card.`);
      names.add(folded);
      const kind = text(i, "kind");
      if (!isComponentKind(kind)) throw new FormValidationError(`Component ${n}: pick what kind of part it is.`);
      const provider = text(i, "provider") === "third_party" ? "third_party" : "in_house";
      const providerName = text(i, "providerName");
      if (provider === "third_party" && providerName === "") {
        throw new FormValidationError(`Component ${n}: name the third party that provides it.`);
      }
      rows.push({
        position: rows.length,
        key: text(i, "key") || null,
        name,
        role: text(i, "role") || null,
        kind,
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
          `Risk ${n}: who is affected must be operator or user.`,
        );
      }
      if (areas.length === 0) {
        throw new FormValidationError(
          `Risk ${n}: pick at least one area of impact.`,
        );
      }
      for (const a of areas) {
        if (!isImpactArea(a)) {
          throw new FormValidationError(
            `Risk ${n}: unknown area of impact: ${a}`,
          );
        }
      }
      rows.push({
        position: rows.length,
        risk: text(i, "risk"),
        source: text(i, "source"),
        vulnerability: text(i, "vulnerability") || null,
        consequence: text(i, "consequence"),
        affected: affected as "operator" | "user",
        impactAreas: areas,
        control: text(i, "control"),
        followUpControl: text(i, "followUpControl") || null,
      });
    }
    if (rows.length === 0) {
      throw new FormValidationError("Add at least one risk.");
    }
    return rows;
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
