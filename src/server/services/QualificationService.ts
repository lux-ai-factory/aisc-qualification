import {
  QualificationRepository,
  qualificationRepository,
  type QualificationWithAnswers,
} from "@/server/repositories/QualificationRepository";
import {
  FormValidationError,
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
import { questionnaireService } from "@/server/services/QuestionnaireService";
import { resolveQuestionnaireVersionId } from "@/domain/forms/legacy";
import type { QuestionnaireResolver } from "@/domain/forms/types";

/** A posted text field, trimmed; null when absent or blank. */
function postedId(formData: FormData, name: string): string | null {
  const raw = formData.get(name);
  return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
}

export class QualificationService {
  constructor(
    private readonly repo: QualificationRepository = qualificationRepository,
    private readonly parser: QualificationFormParser = qualificationFormParser,
    private readonly platform: PlatformClient = platformClient,
    private readonly forms: QuestionnaireResolver = questionnaireService,
  ) {}

  /**
   * Save the AI card of the project's AI system.
   *
   * Every save makes the next card version (a row of core.system, numbered by
   * the platform) and then the card that describes it. Nothing is frozen: an
   * older version is read-only because it is not the latest, which the
   * database enforces. When the platform does not answer, nothing is stored.
   *
   * The questionnaire version the card was filled with is loaded here, from its
   * id: which questions and blocks count is never taken from the request. A page
   * opened before the rename posts `formVersionId`; it is read when the new name
   * is absent (D20).
   */
  async createFromForm(project: string, formData: FormData): Promise<{ id: string; projectId: string }> {
    const id = postedId(formData, "questionnaireVersionId") ?? postedId(formData, "formVersionId");
    const form = await this.forms.resolve(id);
    if (!form) {
      throw new FormValidationError("The questionnaire this was filled with no longer exists. Reload the page.");
    }
    // The parser names the version it read `formVersionId`; the card stores it as questionnaireVersionId.
    const { formVersionId: _parsedVersion, ...parsed } = this.parser.parse(formData, form);
    void _parsedVersion;
    const version = await this.platform.createVersion(project, {
      name: parsed.systemName,
      version: parsed.systemVersion,
      provider: parsed.company,
      description: parsed.description === "" ? null : parsed.description,
    });
    const made = await this.repo.create({
      ...parsed,
      questionnaireVersionId: form.versionId,
      projectId: version.project_id,
      systemId: version.pid,
    });
    // The platform pid travels on to the filler, which uses the project's model.
    return { id: made.id, projectId: version.project_id };
  }

  /** The project's card versions and its cards. A project with no version yet
   *  has no card either: every card points at a version. */
  private async versionsAndCards(project: string) {
    const versions = await this.platform.listVersions(project);
    const cards = versions.length ? await this.repo.list(versions[0].project_id) : [];
    return { versions, cards };
  }

  /**
   * Where the next card starts: the version it will make, and the newest card
   * before it, loaded into the form to be reviewed.
   */
  async startingPoint(
    project: string,
  ): Promise<{ next: NextCard; initial: FormExample | null; fromQuestionnaireVersionId: string | null }> {
    const { versions, cards } = await this.versionsAndCards(project);
    const next = nextCard(versions, cards);
    const from = cards.find((c) => c.id === next.fromCardId);
    return {
      next,
      initial: from ? cardAsFormStart(from) : null,
      fromQuestionnaireVersionId: from ? resolveQuestionnaireVersionId(from.questionnaireVersionId ?? null) : null,
    };
  }

  /** The latest version's card, if it has one: what the system's page shows. */
  async currentCardId(project: string): Promise<string | null> {
    const { versions, cards } = await this.versionsAndCards(project);
    if (!versions.length) return null;
    return cardStanding(versions, cards, versions[0].pid).currentCardId;
  }

  /** Where one card stands among the card versions. */
  async standing(project: string, card: { projectId: string; systemId: string }): Promise<CardStanding> {
    const versions = await this.platform.listVersions(project);
    const cards = await this.repo.list(card.projectId);
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
