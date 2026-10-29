import { randomUUID } from "node:crypto";
import { ledgerSafe, NotCanonical } from "@/vendor/aisc-ledger/canonical";
import { assignComponentKeys } from "@/domain/systemComponents";
import { engineLinks, type LinkedComponent } from "@/domain/cardComponents";
import { engineClient, type EngineClient } from "@/server/services/EngineClient";
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
import { toExport, type QualificationExport } from "@/server/services/QualificationExporter";
import { ontologyService } from "@/server/services/OntologyService";
import type { ReviewCarry } from "@/domain/carryReview";

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
/** What the next card took from the review of the card before it (history and ledger event). */
export type CarriedReview = {
  from_version: number | null;
  carried: string[];
  left: string[];
  draft: ReviewCarry["draft"];
  /** Why nothing could be carried: the builder did not answer, or refused what would come along. */
  failed?: string;
};

/** What a new card's ledger event says: its id, what it was made from, and the review it took
 *  from the card before it (null for a first card). */
export type CreatedCard = { id: string; input: CreateQualificationInput; review: CarriedReview | null };

/** Works out what the next card takes from the card before it (OntologyService). */
export type ReviewCarrier = {
  reviewToCarry(project: string, from: QualificationWithAnswers, next: QualificationExport): Promise<ReviewCarry>;
};

export class QualificationService {
  private readonly repos: RepositoryFor;

  constructor(
    /** The repository of each project; a single repository (a test's) serves every project. */
    repos: RepositoryFor | QualificationRepository = repositoryFor,
    private readonly parser: QualificationFormParser = qualificationFormParser,
    private readonly platform: PlatformClient = platformClient,
    /** The questionnaires of each project: a card is filled with a version from its own project. */
    private readonly formsFor: (project: string) => Promise<QuestionnaireResolver> = questionnaireResolverFor,
    private readonly review: ReviewCarrier = ontologyService,
    /** The engine, read for the components every save links. */
    private readonly engine: Pick<EngineClient, "components"> = engineClient,
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
  ): Promise<{ id: string }> {
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
    const start = await this.startCard(project);
    const allowed = new Set((start?.card.systemComponents ?? []).map((c) => c.key));
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
    // The card links the engine's components as they are now, with a snapshot of each, so the
    // system page can show what changed in the engine since. Read before anything is stored.
    const links = await this.engineLinksOf(project);
    // What the new card takes from the review of the card before it, worked out before anything
    // is stored (the builder is asked, which no transaction should wait on).
    const review = start
      ? await this.carryFrom(
          project,
          start,
          { ...parsed, systemComponents, questionnaireVersionId: form.versionId, engineLinks: links },
          form,
        )
      : null;
    const version = await this.platform.createVersion(project, {
      name: parsed.systemName,
      version: parsed.systemVersion,
      provider: parsed.company,
      description: parsed.description === "" ? null : parsed.description,
    });
    const repo = await this.repos(project);
    const input = { ...parsed, systemComponents, questionnaireVersionId: form.versionId, systemId: version.pid };
    const made = await repo.transaction(async (r, tx) => {
      const created = await r.create({
        ...input,
        engineLinks: links,
        ...(review?.carry.patch ? { ontologyPatch: review.carry.patch } : {}),
        ...(review?.carry.extracted ? { ontologyExtracted: review.carry.extracted } : {}),
      });
      if (start && review) {
        await r.recordHistory({
          qualificationId: created.id,
          kind: "review_carried",
          subject: start.card.id,
          after: review.said,
        });
      }
      await record(tx, { id: created.id, input, review: review?.said ?? null });
      return created;
    });
    // the assessment targets follow the card's components; never a reason to fail the save
    await Promise.resolve()
      .then(() => this.platform.syncTargets(project))
      .catch((err: unknown) => {
        console.warn(`targets of project ${project} not synced after a card save: ${String(err)}`);
      });
    return { id: made.id };
  }

  /** The links to the engine's components a save writes. An engine that does not answer never
   *  stops the save: the card then links nothing. */
  private async engineLinksOf(project: string): Promise<LinkedComponent[]> {
    try {
      return engineLinks(await this.engine.components(project));
    } catch (err) {
      console.warn(`engine components of project ${project} not linked to the card: ${String(err)}`);
      return [];
    }
  }

  /** The project's card versions and its cards' ids. A project with no version
   *  yet has no card either: every card points at a version. */
  private async versionsAndCards(project: string) {
    const versions = await this.platform.listVersions(project);
    const cards = versions.length ? await (await this.repos(project)).cardRefs() : [];
    return { versions, cards };
  }

  /** The newest card before the next version, read in full, and its version number; or null. */
  private async startCard(project: string) {
    const { versions, cards } = await this.versionsAndCards(project);
    const next = nextCard(versions, cards);
    const card = next.fromCardId ? await (await this.repos(project)).find(next.fromCardId) : null;
    return card ? { card, versionNumber: next.fromVersionNumber } : null;
  }

  /**
   * What the next card takes from the review of `start.card`, and what its history row and
   * ledger event say about it. A builder that cannot answer, or refuses what would come along,
   * does not stop the save: nothing comes along, and the record says what stayed behind and why.
   */
  private async carryFrom(
    project: string,
    start: { card: QualificationWithAnswers; versionNumber: number | null },
    next: Omit<CreateQualificationInput, "systemId">,
    form: Parameters<typeof toExport>[1],
  ): Promise<{ carry: ReviewCarry; said: CarriedReview }> {
    const from_version = start.versionNumber;
    try {
      const carry = await this.review.reviewToCarry(project, start.card, toExport(pendingCard(next), form));
      return { carry, said: { from_version, carried: carry.carried, left: carry.left, draft: carry.draft } };
    } catch (err) {
      console.warn(`card review of project ${project} not carried to the next version: ${String(err)}`);
      const left = Object.keys((start.card.ontologyPatch as Record<string, unknown> | null) ?? {});
      const draft = start.card.ontologyExtracted ? "left" : "none";
      const failed = err instanceof Error ? err.message : String(err);
      return {
        carry: { patch: null, extracted: null, carried: [], left, draft },
        said: { from_version, carried: [], left, draft, failed },
      };
    }
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

  /** What this card took from the review of the card before it, and that card's id: its
   *  review_carried history row. Null for a first card, or one saved before reviews were carried. */
  async carriedReview(project: string, id: string): Promise<{ review: CarriedReview; fromCardId: string } | null> {
    const rows = await (await this.repos(project)).history(id);
    const row = rows.find((r) => r.kind === "review_carried");
    return row?.subject ? { review: row.after as unknown as CarriedReview, fromCardId: row.subject } : null;
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

/**
 * The card `input` will be once stored, in the shape toExport reads: the next card's content,
 * compared and built before it is written. test/db/carriedReview.db.test.ts holds its export to
 * the stored card's.
 */
function pendingCard(input: Omit<CreateQualificationInput, "systemId">): QualificationWithAnswers {
  return {
    ...input,
    id: "pending",
    answers: input.answers.map((a, i) => ({ ...a, id: `pending-${i}`, qualificationId: "pending" })),
    risks: [...input.risks].sort((a, b) => a.position - b.position),
    systemComponents: [...(input.systemComponents ?? [])].sort((a, b) => a.position - b.position),
    components: input.engineLinks ?? [],
  } as unknown as QualificationWithAnswers;
}
