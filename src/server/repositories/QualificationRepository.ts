import type {
  PrismaClient,
  Prisma,
  Qualification,
  QualificationAnswer,
  QualificationRisk,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { RiskInput } from "@/server/forms/QualificationFormParser";

export type AnswerInput = {
  toolId: string;
  questionId: string;
  answer: string;
};

export type CreateQualificationInput = {
  systemName: string;
  systemVersion: string;
  company: string;
  description: string;
  targetUseCase: string;
  targetUsers: string;
  intendedDeployers: string;
  targetSystemTags: string[];
  sectorTags: string[];
  marketFormTags: string[];
  localityTags: string[];
  answers: AnswerInput[];
  risks: RiskInput[];
};

export type QualificationWithAnswers = Qualification & {
  answers: QualificationAnswer[];
  risks: QualificationRisk[];
};

export class QualificationRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  create(input: CreateQualificationInput): Promise<{ id: string }> {
    const { answers, risks, ...rest } = input;
    return this.db.qualification.create({
      data: {
        ...rest,
        answers: { create: answers },
        risks: { create: risks },
      },
      select: { id: true },
    });
  }

  find(id: string): Promise<QualificationWithAnswers | null> {
    return this.db.qualification.findUnique({
      where: { id },
      include: { answers: true, risks: { orderBy: { position: "asc" } } },
    });
  }

  list(): Promise<QualificationWithAnswers[]> {
    return this.db.qualification.findMany({
      orderBy: { createdAt: "desc" },
      include: { answers: true, risks: { orderBy: { position: "asc" } } },
    });
  }

  /** Everything an AI card needs that is not in the graph: the facts the
   *  form collects, plus the generated prose if any exists. */
  cardSummary(id: string): Promise<
    | (Pick<
        Qualification,
        | "id"
        | "systemName"
        | "systemVersion"
        | "company"
        | "description"
        | "targetUseCase"
        | "targetUsers"
        | "targetSystemTags"
        | "sectorTags"
      > & {
        systemCardJson: Prisma.JsonValue | null;
      })
    | null
  > {
    return this.db.qualification.findUnique({
      where: { id },
      select: {
        id: true,
        systemCardJson: true,
        systemName: true,
        systemVersion: true,
        company: true,
        description: true,
        targetUseCase: true,
        targetUsers: true,
        targetSystemTags: true,
        sectorTags: true,
      },
    });
  }

  /** The knowledge graph kept for this system, if one has been built. */
  knowledgeGraph(qualificationId: string) {
    return this.db.knowledgeGraph.findUnique({ where: { qualificationId } });
  }

  /** Keep this system's graph, replacing whatever was there. */
  saveKnowledgeGraph(
    data: Omit<Prisma.KnowledgeGraphUncheckedCreateInput, "id" | "builtAt">,
  ) {
    const { qualificationId, ...rest } = data;
    return this.db.knowledgeGraph.upsert({
      where: { qualificationId },
      create: { qualificationId, ...rest },
      update: { ...rest, builtAt: new Date() },
    });
  }

  saveOntologyPatch(
    id: string,
    patch: Prisma.InputJsonValue,
  ): Promise<Qualification> {
    return this.db.qualification.update({
      where: { id },
      data: { ontologyPatch: patch, ontologyAt: new Date() },
    });
  }

  saveOntologyExtracted(
    id: string,
    extracted: Prisma.InputJsonValue,
  ): Promise<Qualification> {
    return this.db.qualification.update({
      where: { id },
      data: { ontologyExtracted: extracted, ontologyAt: new Date() },
    });
  }

  saveSystemCard(
    id: string,
    json: Prisma.InputJsonValue,
  ): Promise<Qualification> {
    return this.db.qualification.update({
      where: { id },
      data: { systemCardJson: json, systemCardAt: new Date() },
    });
  }
}

export const qualificationRepository = new QualificationRepository();
