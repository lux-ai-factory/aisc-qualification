import {
  QualificationRepository,
  repositoryFor,
  type QualificationWithAnswers,
  type RepositoryFor,
} from "@/server/repositories/QualificationRepository";
import {
  QualificationFormParser,
  qualificationFormParser,
} from "@/server/forms/QualificationFormParser";
import { PlatformClient, platformClient } from "@/server/services/PlatformClient";
import {
  cardAsFormStart,
  cardStanding,
  nextCard,
  type CardStanding,
  type NextCard,
} from "@/domain/cardVersions";
import type { FormExample } from "@/data/examples/types";

/**
 * The AI cards of a project. Every method names its project, and its cards are
 * read from and written to that project's own database. The pages call this
 * behind the middleware's door, the actions after their own.
 */
export class QualificationService {
  private readonly repos: RepositoryFor;

  constructor(
    /** The repository of each project; a single repository (a test's) serves every project. */
    repos: RepositoryFor | QualificationRepository = repositoryFor,
    private readonly parser: QualificationFormParser = qualificationFormParser,
    private readonly platform: PlatformClient = platformClient,
  ) {
    this.repos = typeof repos === "function" ? repos : async () => repos;
  }

  /**
   * Save the AI card of the project's AI system.
   *
   * Every save makes the next card version (a row of project.system in the
   * project's own database, numbered by the platform) and then the card that
   * describes it, in the same database. Nothing is frozen: an
   * older version is read-only because it is not the latest, which the
   * database enforces. When the platform does not answer, nothing is stored.
   */
  async createFromForm(project: string, formData: FormData): Promise<{ id: string; projectId: string }> {
    const parsed = this.parser.parse(formData);
    const version = await this.platform.createVersion(project, {
      name: parsed.systemName,
      version: parsed.systemVersion,
      provider: parsed.company,
      description: parsed.description,
    });
    const repo = await this.repos(project);
    const made = await repo.create({
      ...parsed,
      systemId: version.pid,
    });
    // The platform pid travels on to the filler, which uses the project's model.
    return { id: made.id, projectId: version.project_id };
  }

  /** The project's card versions and its cards. A project with no version yet
   *  has no card either: every card points at a version. */
  private async versionsAndCards(project: string) {
    const versions = await this.platform.listVersions(project);
    const cards = versions.length ? await (await this.repos(project)).list() : [];
    return { versions, cards };
  }

  /**
   * Where the next card starts: the version it will make, and the newest card
   * before it, loaded into the form to be reviewed.
   */
  async startingPoint(project: string): Promise<{ next: NextCard; initial: FormExample | null }> {
    const { versions, cards } = await this.versionsAndCards(project);
    const next = nextCard(versions, cards);
    const from = cards.find((c) => c.id === next.fromCardId);
    return { next, initial: from ? cardAsFormStart(from) : null };
  }

  /** The latest version's card, if it has one: what the system's page shows. */
  async currentCardId(project: string): Promise<string | null> {
    const { versions, cards } = await this.versionsAndCards(project);
    if (!versions.length) return null;
    return cardStanding(versions, cards, versions[0].pid).currentCardId;
  }

  /** Where one card stands among the card versions. */
  async standing(project: string, card: { systemId: string }): Promise<CardStanding> {
    const versions = await this.platform.listVersions(project);
    const cards = await (await this.repos(project)).list();
    return cardStanding(versions, cards, card.systemId);
  }

  /** Each version's number, by its pid, for labelling the cards. */
  async versionNumbers(project: string): Promise<Map<string, number>> {
    const versions = await this.platform.listVersions(project);
    return new Map(versions.map((v) => [v.pid, v.number]));
  }

  /** The card versions, highest number first. */
  versions(project: string) {
    return this.platform.listVersions(project);
  }

  async list(project: string): Promise<QualificationWithAnswers[]> {
    return (await this.repos(project)).list();
  }

  /** One qualification of one project, looked up in that project's database. */
  async get(project: string, id: string): Promise<QualificationWithAnswers | null> {
    return (await this.repos(project)).find(id);
  }
}

export const qualificationService = new QualificationService();
