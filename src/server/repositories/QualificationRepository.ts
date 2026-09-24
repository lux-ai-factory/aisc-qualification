import type {
  PrismaClient,
  Prisma,
  Qualification,
  CardComponent,
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
  /** The engine components the card links, oldest link first. */
  components: CardComponent[];
};

/** A link from a card to one engine component, with its snapshot. */
export type ComponentLinkInput = {
  componentPid: string;
  airoProperty: string;
  name: string;
  componentType: string;
  objectName: string;
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
   * whose it is: without it, anyone who could open one project's page could
   * read any project's system description, answers and risks.
   */
  find(projectId: string, id: string): Promise<QualificationWithAnswers | null> {
    return this.db.qualification.findFirst({
      where: { id, projectId },
      include: {
        answers: true,
        risks: { orderBy: { position: "asc" } },
        components: { orderBy: { linkedAt: "asc" } },
      },
    });
  }

  /** The AI card of one version of the project's system, if it has one. One
   *  card per version: the database holds that too (system_id is unique). */
  findBySystem(projectId: string, systemId: string): Promise<{ id: string } | null> {
    return this.db.qualification.findFirst({
      where: { projectId, systemId },
      select: { id: true },
    });
  }

  /** The qualifications of one project, and no other's: a module reads what
   *  it needs and no more. */
  list(projectId: string): Promise<QualificationWithAnswers[]> {
    return this.db.qualification.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: {
        answers: true,
        risks: { orderBy: { position: "asc" } },
        components: { orderBy: { linkedAt: "asc" } },
      },
    });
  }

  /** Link one engine component to the card, or change the link's property and snapshot. */
  linkComponent(qualificationId: string, link: ComponentLinkInput) {
    return this.db.cardComponent.upsert({
      where: {
        qualificationId_componentPid: { qualificationId, componentPid: link.componentPid },
      },
      create: { qualificationId, ...link },
      update: {
        airoProperty: link.airoProperty,
        name: link.name,
        componentType: link.componentType,
        objectName: link.objectName,
      },
    });
  }

  /** Remove the card's link to one engine component. */
  unlinkComponent(qualificationId: string, componentPid: string) {
    return this.db.cardComponent.deleteMany({ where: { qualificationId, componentPid } });
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
        | "systemId"
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
        systemId: true,
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
