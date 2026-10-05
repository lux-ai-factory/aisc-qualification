import { randomUUID } from "node:crypto";
import { ledgerSafe, NotCanonical } from "@/server/ledger/canonical";
import { assignComponentKeys } from "@/domain/systemComponents";
import {
  QualificationRepository,
  repositoryFor,
  type QualificationWithAnswers,
  type RepositoryFor,
  type CreateQualificationInput,
  type Tx,
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
import { questionnaireResolverFor } from "@/server/services/QuestionnaireService";
import { resolveQuestionnaireVersionId } from "@/domain/forms/legacy";
import type { QuestionnaireResolver } from "@/domain/forms/types";

/** A posted text field, trimmed; null when absent or blank. */
function postedId(formData: FormData, name: string): string | null {
  const raw = formData.get(name);
  return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
}

/**
 * The AI cards of a project. Every method names its project, and its cards are
 * read from and written to that project's own database. The pages call this
 * behind the middleware's door, the actions after their own.
 */
/** What a new card's ledger event says: its id and what it was made from. */
export type CreatedCard = { id: string; input: CreateQualificationInput };

export class QualificationService {
  private readonly repos: RepositoryFor;

  constructor(
    /** The repository of each project; a single repository (a test's) serves every project. */
    repos: RepositoryFor | QualificationRepository = repositoryFor,
    private readonly parser: QualificationFormParser = qualificationFormParser,
    private readonly platform: PlatformClient = platformClient,
    /** The questionnaires of each project: a card is filled with a version from its own project. */
    private readonly formsFor: (project: string) => Promise<QuestionnaireResolver> = questionnaireResolverFor,
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
   *
   * The questionnaire version the card was filled with is loaded here, from its
   * id: which questions and blocks count is never taken from the request. A page
   * opened before `questionnaireVersionId` existed posts `formVersionId`, which is
   * read when the new name is absent.
   */
  async createFromForm(
    project: string,
    formData: FormData,
    /** The caller's ledger event, written in the card's own transaction. */
    record: (tx: Tx, card: CreatedCard) => Promise<unknown> = async () => undefined,
  ): Promise<{ id: string; projectId: string }> {
    const id = postedId(formData, "questionnaireVersionId") ?? postedId(formData, "formVersionId");
    const form = await (await this.formsFor(project)).resolve(id);
    if (!form) {
      throw new FormValidationError("The questionnaire this was filled with no longer exists. Reload the page.");
    }
    // The parser names the version it read `formVersionId`; the card stores it as questionnaireVersionId.
    const { formVersionId: _parsedVersion, systemComponents: posted, ...parsed } = this.parser.parse(formData, form);
    void _parsedVersion;
    // Component keys come from the card this save starts from, never from the browser: a row
    // carried from it keeps its key, a new row gets a fresh one, anything else is refused before
    // anything is written.
    // (the card before is looked up only when a row claims one of its keys)
    let allowed = new Set<string>();
    if ((posted ?? []).some((row) => row.key !== null)) {
      const from = await this.startCard(project);
      allowed = new Set((from?.systemComponents ?? []).map((c) => c.key));
    }
    const systemComponents = assignComponentKeys(posted ?? [], allowed, () => randomUUID());
    // The card's ledger event carries its content, and is refused when the ledger cannot keep it (an
    // unpaired surrogate in an answer): asked now, before the version is made, so a refused save
    // leaves no version without a card.
    try {
      ledgerSafe(JSON.parse(JSON.stringify({ ...parsed, systemComponents, questionnaireVersionId: form.versionId })));
    } catch (err) {
      if (err instanceof NotCanonical) {
        throw new FormValidationError(`An answer holds text the record cannot keep (${err.message}). Retype it and save again.`);
      }
      throw err;
    }
    const version = await this.platform.createVersion(project, {
      name: parsed.systemName,
      version: parsed.systemVersion,
      provider: parsed.company,
      description: parsed.description === "" ? null : parsed.description,
    });
    const repo = await this.repos(project);
    const input = { ...parsed, systemComponents, questionnaireVersionId: form.versionId, systemId: version.pid };
    const made = await repo.transaction(async (r, tx) => {
      const created = await r.create(input);
      await record(tx, { id: created.id, input });
      return created;
    });
    // the assessment targets follow the card's components; never a reason to fail the save
    await Promise.resolve()
      .then(() => this.platform.syncTargets(project))
      .catch((err: unknown) => {
        console.warn(`targets of project ${project} not synced after a card save: ${String(err)}`);
      });
    // The platform pid travels on to the filler, which uses the project's model.
    return { id: made.id, projectId: version.project_id };
  }

  /** The project's card versions and its cards' ids. A project with no version
   *  yet has no card either: every card points at a version. */
  private async versionsAndCards(project: string) {
    const versions = await this.platform.listVersions(project);
    const cards = versions.length ? await (await this.repos(project)).cardRefs() : [];
    return { versions, cards };
  }

  /** The newest card before the next version, read in full, or null. */
  private async startCard(project: string) {
    const { versions, cards } = await this.versionsAndCards(project);
    const id = nextCard(versions, cards).fromCardId;
    return id ? (await this.repos(project)).find(id) : null;
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
    const from = next.fromCardId ? await (await this.repos(project)).find(next.fromCardId) : null;
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
  async standing(project: string, card: { systemId: string }): Promise<CardStanding> {
    const versions = await this.platform.listVersions(project);
    const cards = await (await this.repos(project)).cardRefs();
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
