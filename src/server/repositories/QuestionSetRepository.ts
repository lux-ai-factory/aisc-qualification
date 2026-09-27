import type { PrismaClient, Prisma, Question, QuestionSet, Questionnaire } from "@prisma/client";

/**
 * The question-set tables (two-level forms, spec 3.1). Versions and their items are
 * append-only and a question's identity is fixed (the migration's triggers refuse
 * an update or a delete), so the only writes are a new version in one transaction
 * and retiring a set.
 *
 * The methods below are the contract QuestionSetService is written against;
 * test/support/fakeQuestionnaireStore.ts implements the same ones in memory.
 * Nothing here runs a query until a method is called.
 */

/** What a set version is read with: its set, and its items in order with their question. */
export const SET_VERSION_INCLUDE = {
  set: true,
  items: { orderBy: { position: "asc" }, include: { question: true } },
} as const satisfies Prisma.QuestionSetVersionInclude;

export type SetVersionRow = Prisma.QuestionSetVersionGetPayload<{ include: typeof SET_VERSION_INCLUDE }>;

/** A questionnaire version and what it needs that does not exist yet, written together. */
export type QuestionnaireVersionInsert = {
  /** Present when the questionnaire is new. */
  questionnaire?: { id: string; name: string; description: string; origin: string; listed: boolean; createdBy: string };
  version: { id: string; questionnaireId: string; number: number; blocks: string[]; createdBy: string };
  items: Array<{ position: number; setVersionId: string; questionId: string }>;
};

/** A set version and what it needs that does not exist yet, written together. */
export type SetVersionInsert = {
  /** Present when the set is new. */
  set?: { id: string; name: string; description: string; origin: string; createdBy: string };
  version: { id: string; setId: string; number: number; createdBy: string };
  newQuestions: Array<{ id: string; setId: string; scope: string; localId: string }>;
  items: Array<{
    questionId: string;
    position: number;
    text: string;
    citation: string;
    required: boolean;
    annexPoint: string | null;
    groupLabel: string | null;
  }>;
  /** The questionnaire made in the same transaction (T49 "Also make a questionnaire", T54). */
  questionnaire?: QuestionnaireVersionInsert;
};

type Tx = Prisma.TransactionClient;

/** Writes one questionnaire version plan inside a transaction. */
export async function writeQuestionnaireVersion(tx: Tx, plan: QuestionnaireVersionInsert): Promise<void> {
  if (plan.questionnaire) await tx.questionnaire.create({ data: plan.questionnaire });
  await tx.questionnaireVersion.create({ data: plan.version });
  if (plan.items.length > 0) {
    await tx.questionnaireVersionItem.createMany({
      data: plan.items.map((i) => ({ ...i, questionnaireVersionId: plan.version.id })),
    });
  }
}

export class QuestionSetRepository {
  /** `db` is one project's database: the forms a project makes are its own. */
  constructor(protected readonly db: PrismaClient) {}

  /** Every set, retired or not. */
  listSets(): Promise<QuestionSet[]> {
    return this.db.questionSet.findMany();
  }

  findSet(id: string): Promise<QuestionSet | null> {
    return this.db.questionSet.findUnique({ where: { id } });
  }

  findSetVersion(id: string): Promise<SetVersionRow | null> {
    return this.db.questionSetVersion.findUnique({ where: { id }, include: SET_VERSION_INCLUDE });
  }

  /** Every version of a set, oldest first. */
  setVersionsOf(setId: string): Promise<SetVersionRow[]> {
    return this.db.questionSetVersion.findMany({
      where: { setId },
      orderBy: { number: "asc" },
      include: SET_VERSION_INCLUDE,
    });
  }

  findQuestion(id: string): Promise<Question | null> {
    return this.db.question.findUnique({ where: { id } });
  }

  /** Every question identity a set owns, in any of its versions. */
  questionsOf(setId: string): Promise<Question[]> {
    return this.db.question.findMany({ where: { setId } });
  }

  /**
   * Every questionnaire, listed or not, retired or not: a set saved with "Also make a
   * questionnaire" checks the name that questionnaire would take.
   */
  listQuestionnaires(): Promise<Questionnaire[]> {
    return this.db.questionnaire.findMany();
  }

  /** The new set (when new), its new questions, the version and its items, and a questionnaire: one transaction. */
  async insertSetVersion(plan: SetVersionInsert): Promise<void> {
    await this.db.$transaction(async (tx) => {
      if (plan.set) await tx.questionSet.create({ data: plan.set });
      if (plan.newQuestions.length > 0) await tx.question.createMany({ data: plan.newQuestions });
      await tx.questionSetVersion.create({ data: plan.version });
      if (plan.items.length > 0) {
        await tx.questionSetVersionItem.createMany({
          data: plan.items.map((i) => ({ ...i, setVersionId: plan.version.id })),
        });
      }
      if (plan.questionnaire) await writeQuestionnaireVersion(tx, plan.questionnaire);
    });
  }

  /** The only update the triggers allow on a set: retired_at, once. */
  async retireSet(id: string, at: Date): Promise<void> {
    await this.db.questionSet.update({ where: { id }, data: { retiredAt: at } });
  }
}
