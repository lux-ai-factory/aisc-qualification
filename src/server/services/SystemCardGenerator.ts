import type { Prisma } from "@prisma/client";
import { TaxonomyService, taxonomyService } from "@/domain/Taxonomy";
import { assembleSystemCard, type SystemCard } from "@/domain/SystemCard";
import {
  QualificationRepository,
  qualificationRepository,
} from "@/server/repositories/QualificationRepository";
import { LlmCardClient } from "./LlmCardClient";
import {
  SystemCardPromptBuilder,
  systemCardPromptBuilder,
} from "./SystemCardPromptBuilder";

export class SystemCardGenerator {
  constructor(
    private readonly repo: QualificationRepository = qualificationRepository,
    private readonly taxonomy: TaxonomyService = taxonomyService,
    private readonly promptBuilder: SystemCardPromptBuilder = systemCardPromptBuilder,
    private readonly clientFactory: () => LlmCardClient = () =>
      LlmCardClient.fromEnv(),
  ) {}

  async generate(qualificationId: string): Promise<SystemCard> {
    const q = await this.repo.find(qualificationId);
    if (!q) throw new Error("Qualification not found.");

    const targetSystems = q.targetSystemTags
      .map((t) => this.taxonomy.parseTargetSystemTag(t))
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const sectors = q.sectorTags
      .map((id) => this.taxonomy.findSector(id))
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (targetSystems.length === 0 || sectors.length === 0) {
      throw new Error(
        "Qualification is missing target-system or sector tags — re-open and complete it.",
      );
    }

    const userPrompt = this.promptBuilder.buildUserPrompt({
      systemName: q.systemName,
      systemVersion: q.systemVersion,
      company: q.company,
      description: q.description,
      targetUseCase: q.targetUseCase,
      targetUsers: q.targetUsers,
      targetSystems: targetSystems.map((t) => ({
        category: t.category.name,
        subcategory: t.sub.name,
      })),
      sectors: sectors.map((s) => s.name),
      answers: q.answers.map((a) => ({
        toolId: a.toolId,
        questionId: a.questionId,
        answer: a.answer,
      })),
    });

    const raw = await this.clientFactory().generate(userPrompt);
    const card = assembleSystemCard(q, raw, targetSystems, sectors);
    await this.repo.saveSystemCard(
      qualificationId,
      card as unknown as Prisma.InputJsonValue,
    );
    return card;
  }
}

export const systemCardGenerator = new SystemCardGenerator();
