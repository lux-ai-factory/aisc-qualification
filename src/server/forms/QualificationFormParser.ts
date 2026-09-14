import { z } from "zod";
import { TaxonomyService, taxonomyService } from "@/domain/Taxonomy";
import { KEY_QUESTIONS, keyQuestionIdSet } from "@/data/keyQuestions";
import {
  isAffected,
  isImpactArea,
  isLocality,
  isMarketForm,
} from "@/data/airoVocab";
import type { AnswerInput } from "@/server/repositories/QualificationRepository";

const metadataSchema = z.object({
  systemName: z.string().min(1, "System name is required"),
  systemVersion: z.string().min(1, "Version is required"),
  company: z.string().min(1, "Company is required"),
  description: z.string().min(1, "Description is required"),
  targetUseCase: z.string().min(1, "Target use case is required"),
  targetUsers: z.string().min(1, "Target users are required"),
  intendedDeployers: z.string().min(1, "Intended deployers are required"),
});

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

export type ParsedQualification = z.infer<typeof metadataSchema> & {
  targetSystemTags: string[];
  sectorTags: string[];
  marketFormTags: string[];
  localityTags: string[];
  answers: AnswerInput[];
  risks: RiskInput[];
};

export class FormValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormValidationError";
  }
}

export class QualificationFormParser {
  constructor(private readonly taxonomy: TaxonomyService = taxonomyService) {}

  parse(formData: FormData): ParsedQualification {
    const metadata = metadataSchema.safeParse({
      systemName: formData.get("systemName"),
      systemVersion: formData.get("systemVersion"),
      company: formData.get("company"),
      description: formData.get("description"),
      targetUseCase: formData.get("targetUseCase"),
      targetUsers: formData.get("targetUsers"),
      intendedDeployers: this.trimmed(formData, "intendedDeployers"),
    });
    if (!metadata.success) {
      throw new FormValidationError(metadata.error.issues[0].message);
    }

    const targetSystemTags = this.collectStrings(formData, "targetSystemTags");
    const sectorTags = this.collectStrings(formData, "sectorTags");
    if (targetSystemTags.length === 0) {
      throw new FormValidationError(
        "Pick at least one target-system capability.",
      );
    }
    if (sectorTags.length === 0) {
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
    const marketFormTags = this.collectStrings(formData, "marketFormTags");
    const localityTags = this.collectStrings(formData, "localityTags");
    if (marketFormTags.length === 0) {
      throw new FormValidationError("Pick at least one market form.");
    }
    if (localityTags.length === 0) {
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

    // The Annex IV sub-items flagged "where applicable" may be left blank; the
    // rest must be answered.
    const missing: string[] = [];
    for (const k of KEY_QUESTIONS) {
      if (k.optional) continue;
      const value = formData.get(`q:${k.group}:${k.id}`);
      if (typeof value !== "string" || value.trim().length === 0) {
        missing.push(k.id);
      }
    }
    if (missing.length > 0) {
      throw new FormValidationError(
        `Please answer all required questions (${missing.length} missing).`,
      );
    }

    const validIds = keyQuestionIdSet();
    const answers: AnswerInput[] = [];
    for (const [field, raw] of formData.entries()) {
      if (!field.startsWith("q:")) continue;
      if (typeof raw !== "string") continue;
      const value = raw.trim();
      if (!value) continue;
      const parts = field.split(":");
      if (parts.length < 3) continue;
      const toolId = parts[1];
      const questionId = parts.slice(2).join(":");
      if (!validIds.has(`${toolId}:${questionId}`)) continue;
      answers.push({ toolId, questionId, answer: value });
    }

    const risks = this.parseRisks(formData);

    return {
      ...metadata.data,
      targetSystemTags,
      sectorTags,
      marketFormTags,
      localityTags,
      answers,
      risks,
    };
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
