import type {
  PrismaClient,
  Prisma,
  Qualification,
  CardComponent,
  QualificationAnswer,
  QualificationRisk,
  QualificationComponent,
} from "@prisma/client";
import { projectDbPastDoor } from "@/lib/projectDb";
import type { RiskInput } from "@/server/forms/QualificationFormParser";
import type { KeyedComponent } from "@/domain/systemComponents";

export type AnswerInput = {
  toolId: string;
  questionId: string;
  answer: string;
};

export type CreateQualificationInput = {
  /** The card version it describes: a row of project.system in this project's
   *  own database, as named by the platform (uuid). */
  systemId: string;
  systemName: string;
  systemVersion: string;
  company: string;
  description: string;
  targetUseCase: string;
  targetUsers: string;
  /** null when the card's form does not include the deployers block. */
  intendedDeployers: string | null;
  /** VAIR AISystem and Purpose terms; null when left open. */
  systemType: string | null;
  purpose: string | null;
  /** VAIR AIOperator terms; null when left open. */
  providerTerm: string | null;
  deployerTerm: string | null;
  /** VAIR terms: AICapability, Domain, Modality, LocalityOfUse. */
  targetSystemTags: string[];
  sectorTags: string[];
  marketFormTags: string[];
  localityTags: string[];
  answers: AnswerInput[];
  risks: RiskInput[];
  /** The Components block's rows, keys assigned (targets plan v2). */
  systemComponents?: KeyedComponent[];
  /** The questionnaire version the card was filled with. */
  questionnaireVersionId: string;
};

export type QualificationWithAnswers = Qualification & {
  answers: QualificationAnswer[];
  risks: QualificationRisk[];
  /** The engine components the card links, oldest link first. */
  components: CardComponent[];
  /** The Components block's rows, in order. */
  systemComponents: QualificationComponent[];
};

/** A link from a card to one engine component, with its snapshot. */
export type ComponentLinkInput = {
  componentPid: string;
  airoProperty: string;
  name: string;
  componentType: string;
  objectName: string;
  /** Which of the card's components the item is; null for none. */
  componentKey?: string | null;
};

/** What a qualification is read with: its answers, and its risks and links in order. */
const WITH_ANSWERS = {
  answers: true,
  risks: { orderBy: { position: "asc" } },
  components: { orderBy: { linkedAt: "asc" } },
  systemComponents: { orderBy: { position: "asc" } },
} as const satisfies Prisma.QualificationInclude;

/**
 * The cards of ONE project: a repository is bound to that project's own
 * database, so every query is inside the project without naming it. A card id
 * from another project is simply not in this database.
 */
export class QualificationRepository {
  constructor(private readonly db: PrismaClient) {}

  create(input: CreateQualificationInput): Promise<{ id: string }> {
    const { answers, risks, systemComponents, ...rest } = input;
    return this.db.qualification.create({
      data: {
        ...rest,
        answers: { create: answers },
        risks: { create: risks },
        systemComponents: { create: systemComponents ?? [] },
      },
      select: { id: true },
    });
  }

  /**
   * One qualification of this project, or null.
   *
   * The id comes out of a URL; the database this repository is bound to is what
   * says whose it is, so a card of another project is not found here.
   */
  find(id: string): Promise<QualificationWithAnswers | null> {
    return this.db.qualification.findFirst({
      where: { id },
      include: WITH_ANSWERS,
    });
  }

  /** The AI card of one version of the project's system, if it has one. One
   *  card per version: the database holds that too (system_id is unique). */
  findBySystem(
    systemId: string,
  ): Promise<{ id: string; systemId: string; systemName: string; systemVersion: string } | null> {
    return this.db.qualification.findFirst({
      where: { systemId },
      select: { id: true, systemId: true, systemName: true, systemVersion: true },
    });
  }

  /** The qualifications of this project, newest first. */
  list(): Promise<QualificationWithAnswers[]> {
    return this.db.qualification.findMany({
      orderBy: { createdAt: "desc" },
      include: WITH_ANSWERS,
    });
  }

  /** Link one engine component to the card, or change the link's property and snapshot. */
  linkComponent(qualificationId: string, link: ComponentLinkInput) {
    const { componentPid, ...snapshot } = link;
    return this.db.cardComponent.upsert({
      where: { qualificationId_componentPid: { qualificationId, componentPid } },
      create: { qualificationId, ...link },
      update: snapshot,
    });
  }

  /** The keys of the card's components (its Components block). */
  async componentKeys(qualificationId: string): Promise<string[]> {
    const rows = await this.db.qualificationComponent.findMany({ where: { qualificationId }, select: { key: true } });
    return rows.map((r) => r.key);
  }

  /** Remove the card's link to one engine component. */
  unlinkComponent(qualificationId: string, componentPid: string) {
    return this.db.cardComponent.deleteMany({ where: { qualificationId, componentPid } });
  }

  /** Everything an AI card needs that is not in the graph: the facts the
   *  form collects, plus the generated prose if any exists. */
  cardSummary(
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
        | "questionnaireVersionId"
      > & {
        systemCardJson: Prisma.JsonValue | null;
      })
    | null
  > {
    return this.db.qualification.findFirst({
      where: { id },
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
        questionnaireVersionId: true,
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

  /**
   * Whether this card version is the latest in this project's database: the
   * rule the only-latest triggers enforce (qualification.card_is_latest). For
   * a caller with no user behind it, the card agent, which the platform's
   * /system-versions/latest would not answer.
   */
  async isLatest(systemId: string): Promise<boolean> {
    const rows = await this.db.$queryRaw<{ latest: boolean }[]>`
      SELECT qualification.card_is_latest(${systemId}::uuid) AS latest`;
    return rows[0]?.latest === true;
  }
}

/** Opens the repository of one project. */
export type RepositoryFor = (project: string) => Promise<QualificationRepository>;

/**
 * The repository of a project whose door has already been passed (a page under
 * the middleware, a service called after an action's or a route's door).
 */
export const repositoryFor: RepositoryFor = async (project) =>
  new QualificationRepository(await projectDbPastDoor(project));
