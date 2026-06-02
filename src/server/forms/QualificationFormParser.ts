import { z } from "zod";
import { TaxonomyService, taxonomyService } from "@/domain/Taxonomy";
import { KEY_QUESTIONS } from "@/data/keyQuestions";
import type { AnswerInput } from "@/server/repositories/QualificationRepository";

const metadataSchema = z.object({
  systemName: z.string().min(1, "System name is required"),
  systemVersion: z.string().min(1, "Version is required"),
  company: z.string().min(1, "Company is required"),
  description: z.string().min(1, "Description is required"),
  targetUseCase: z.string().min(1, "Target use case is required"),
  targetUsers: z.string().min(1, "Target users are required"),
});

export type ParsedQualification = z.infer<typeof metadataSchema> & {
  targetSystemTags: string[];
  sectorTags: string[];
  answers: AnswerInput[];
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

    const missing: string[] = [];
    for (const k of KEY_QUESTIONS) {
      const value = formData.get(`q:${k.toolId}:${k.questionId}`);
      if (typeof value !== "string" || value.trim().length === 0) {
        missing.push(k.questionId);
      }
    }
    if (missing.length > 0) {
      throw new FormValidationError(
        `Please answer all key questions (${missing.length} missing).`,
      );
    }

    const validIds = this.taxonomy.validQuestionIds();
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

    return {
      ...metadata.data,
      targetSystemTags,
      sectorTags,
      answers,
    };
  }

  private collectStrings(formData: FormData, name: string): string[] {
    return formData
      .getAll(name)
      .map((v) => (typeof v === "string" ? v : ""))
      .filter(Boolean);
  }
}

export const qualificationFormParser = new QualificationFormParser();
