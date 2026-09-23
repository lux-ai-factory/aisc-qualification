import {
  QualificationRepository,
  qualificationRepository,
  type QualificationWithAnswers,
} from "@/server/repositories/QualificationRepository";
import {
  QualificationFormParser,
  qualificationFormParser,
} from "@/server/forms/QualificationFormParser";
import { PlatformClient, platformClient } from "@/server/services/PlatformClient";
import { cardAsFormStart, nextCard, type NextCard } from "@/domain/cardVersions";
import type { FormExample } from "@/data/examples/types";

/** The version already has its AI card; a new card needs a new version. */
export class CardExistsError extends Error {
  constructor(readonly versionNumber: number) {
    super(
      `Version ${versionNumber} of this system already has its AI card. ` +
        "Change the system to start the next version, then submit its card.",
    );
    this.name = "CardExistsError";
  }
}

export class QualificationService {
  constructor(
    private readonly repo: QualificationRepository = qualificationRepository,
    private readonly parser: QualificationFormParser = qualificationFormParser,
    private readonly platform: PlatformClient = platformClient,
  ) {}

  /**
   * Submit the AI card of the project's AI system.
   *
   * A card describes one version of the system and freezes it, so the two
   * stay about the same thing. The platform hands out the version (the draft,
   * or the next one when the latest is frozen), the form sets the system's
   * identity on it, it is frozen, and only then is the card stored. A version
   * has exactly one card: asked for a second, this refuses and stores nothing.
   */
  async createFromForm(project: string, formData: FormData): Promise<{ id: string }> {
    const parsed = this.parser.parse(formData);
    const version = await this.platform.versionForNewCard(project, {
      name: parsed.systemName,
      version: parsed.systemVersion,
      provider: parsed.company,
      description: parsed.description,
    });
    if (await this.repo.findBySystem(version.project_id, version.pid)) {
      throw new CardExistsError(version.number);
    }
    await this.platform.freeze(version.pid, "ai card");
    return this.repo.create({
      ...parsed,
      projectId: version.project_id,
      systemId: version.pid,
    });
  }

  /**
   * Where the next card starts: the version it will describe, and the newest
   * card before it, loaded into the form to be reviewed.
   */
  async startingPoint(project: string): Promise<{ next: NextCard; initial: FormExample | null }> {
    const system = await this.platform.aiSystem(project);
    const cards = await this.repo.list(system.project_id);
    const next = nextCard(system.versions, cards);
    const from = cards.find((c) => c.id === next.fromCardId);
    return { next, initial: from ? cardAsFormStart(from) : null };
  }

  /** Each version's number, by its pid, for labelling the cards. */
  async versionNumbers(project: string): Promise<Map<string, number>> {
    const system = await this.platform.aiSystem(project);
    return new Map(system.versions.map((v) => [v.pid, v.number]));
  }

  list(projectId: string): Promise<QualificationWithAnswers[]> {
    return this.repo.list(projectId);
  }

  /** One qualification of one project. The project is part of the query: see
   *  QualificationRepository.find. */
  get(projectId: string, id: string): Promise<QualificationWithAnswers | null> {
    return this.repo.find(projectId, id);
  }
}

export const qualificationService = new QualificationService();
