import type { PrismaClient, Prisma, Questionnaire } from "@prisma/client";
import { QuestionSetRepository, writeQuestionnaireVersion, type QuestionnaireVersionInsert } from "./QuestionSetRepository";

export type { QuestionnaireVersionInsert } from "./QuestionSetRepository";

/**
 * The questionnaire tables (two-level forms, spec 3.1), plus every read of the
 * question sets (update detection, reference resolution and the self-contained
 * import need them). Versions and items are append-only, so the only writes are a
 * new version in one transaction and retiring a questionnaire.
 *
 * The methods below are the contract QuestionnaireService is written against;
 * test/support/fakeQuestionnaireStore.ts implements the same ones in memory.
 * Nothing here runs a query until a method is called.
 */

/**
 * What a questionnaire version is read with: its questionnaire, and its items in
 * order, each with the set item it is pinned to (THE wording), that item's
 * question, and its set version with its set.
 */
export const QUESTIONNAIRE_VERSION_INCLUDE = {
  questionnaire: true,
  items: {
    orderBy: { position: "asc" },
    include: { setItem: { include: { question: true, setVersion: { include: { set: true } } } } },
  },
} as const satisfies Prisma.QuestionnaireVersionInclude;

export type QuestionnaireVersionRow = Prisma.QuestionnaireVersionGetPayload<{
  include: typeof QUESTIONNAIRE_VERSION_INCLUDE;
}>;

export class QuestionnaireRepository extends QuestionSetRepository {
  constructor(db: PrismaClient) {
    super(db);
  }

  /** Every questionnaire, listed or not, retired or not. */
  listQuestionnaires(): Promise<Questionnaire[]> {
    return this.db.questionnaire.findMany();
  }

  findQuestionnaire(id: string): Promise<Questionnaire | null> {
    return this.db.questionnaire.findUnique({ where: { id } });
  }

  findQuestionnaireVersion(id: string): Promise<QuestionnaireVersionRow | null> {
    return this.db.questionnaireVersion.findUnique({ where: { id }, include: QUESTIONNAIRE_VERSION_INCLUDE });
  }

  /** Every version of a questionnaire, oldest first. */
  questionnaireVersionsOf(questionnaireId: string): Promise<QuestionnaireVersionRow[]> {
    return this.db.questionnaireVersion.findMany({
      where: { questionnaireId },
      orderBy: { number: "asc" },
      include: QUESTIONNAIRE_VERSION_INCLUDE,
    });
  }

  /** The questionnaire (when new), the version and its items: one transaction. */
  async insertQuestionnaireVersion(plan: QuestionnaireVersionInsert): Promise<void> {
    await this.db.$transaction((tx) => writeQuestionnaireVersion(tx, plan));
  }

  /** The only update the triggers allow on a questionnaire: retired_at, once. */
  async retireQuestionnaire(id: string, at: Date): Promise<void> {
    await this.db.questionnaire.update({ where: { id }, data: { retiredAt: at } });
  }
}
