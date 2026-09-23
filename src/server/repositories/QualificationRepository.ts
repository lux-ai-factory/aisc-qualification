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
  /** The platform project this qualification belongs to (uuid). */
  projectId: string;
  /** The system it describes, as named by the platform (uuid). */
  systemId: string;
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

  /**
   * One qualification of one project, or null.
   *
   * Never by id alone. The id comes out of a URL and the project is what says
   * whose it is: a lookup without it served any project's system description,
   * answers and risks to anyone who could open any project's page.
   */
  find(projectId: string, id: string): Promise<QualificationWithAnswers | null> {
    return this.db.qualification.findFirst({
      where: { id, projectId },
      include: { answers: true, risks: { orderBy: { position: "asc" } } },
    });
  }

  /** The qualifications of one project, and no other's: a module reads what
   *  it needs and no more. */
  list(projectId: string): Promise<QualificationWithAnswers[]> {
    return this.db.qualification.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: { answers: true, risks: { orderBy: { position: "asc" } } },
    });
  }

  /** Everything an AI card needs that is not in the graph: the facts the
   *  form collects, plus the generated prose if any exists. */
  cardSummary(
    projectId: string,
    id: string,
  ): Promise<
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
    return this.db.qualification.findFirst({
      where: { id, projectId },
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
