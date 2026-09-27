// An in-memory stand-in for QuestionSetRepository AND QuestionnaireRepository, for the
// QuestionSetService and QuestionnaireService tests (two-level forms,
// docs/superpowers/two-level-forms-2026-09-25/01-spec.md, sections 3 and 5.3). Replaces
// test/support/fakeFormStore.ts.
//
// It defines the repository contract both services are written against. The rows are the
// Prisma models of spec 3.3 (field names as in the Prisma client); the methods below are the
// only ones the services may call. The real repositories implement the same methods with
// Prisma (QuestionnaireRepository may extend QuestionSetRepository: it needs the set reads too,
// for update detection, reference resolution and the self-contained import).
//
//   QuestionSetRepository
//     listSets()                      every set, retired or not
//     findSet(id)                     one set, or null
//     findSetVersion(id)              one set version with its set and its items in position
//                                     order, each item with its Question; or null
//     setVersionsOf(setId)            every version of a set, same shape, number ascending
//     findQuestion(id)                one Question, or null
//     questionsOf(setId)              every Question the set owns (in any of its versions)
//     insertSetVersion(plan)          ONE transaction: the set (plan.set, when new), the new
//                                     question identities, the version, its items, and, when
//                                     plan.questionnaire is given, that questionnaire version
//                                     too (the import's "Also make a questionnaire", T49, and
//                                     the self-contained import, T54)
//     retireSet(id, at)               sets retired_at (the only UPDATE the triggers allow)
//
//   QuestionnaireRepository (plus every read above)
//     listQuestionnaires()            every questionnaire, listed or not, retired or not
//     findQuestionnaire(id)           one questionnaire, or null
//     findQuestionnaireVersion(id)    one version with its questionnaire and its items in
//                                     position order, each item with its setItem (the
//                                     QuestionSetVersionItem: THE wording), that item's
//                                     question, and its setVersion with its set; or null
//     questionnaireVersionsOf(id)     every version of a questionnaire, same shape, number asc.
//     insertQuestionnaireVersion(p)   ONE transaction: the questionnaire (p.questionnaire, when
//                                     new), the version, its items
//     retireQuestionnaire(id, at)     sets retired_at
//
// Like the database, the fake refuses what the migration's constraints and triggers refuse
// (spec 3.1, 3.2): a taken (setId, number) or (questionnaireId, number), a second active set
// or listed questionnaire with the same name ignoring case, a taken (scope, localId), all fail
// with an error whose `code` is "P2002", as Prisma's do; an item naming no set item fails with
// code "P2003"; a new version of a builtin or retired set/questionnaire, and a set item whose
// question is of another set, fail with the trigger's message. A write that fails writes
// nothing. The builtin rows are "annex-iv" (set) and "annex-iv-default" (questionnaire).
import { KEY_QUESTIONS } from "@/data/keyQuestions";
import { ALL_BLOCKS, ANNEX_DESCRIPTION } from "./forms";

export type QuestionSetRow = {
  id: string;
  name: string;
  description: string;
  origin: string;
  retiredAt: Date | null;
  createdAt: Date;
  createdBy: string;
};
export type QuestionSetVersionRow = {
  id: string;
  setId: string;
  number: number;
  createdAt: Date;
  createdBy: string;
};
export type QuestionRow = {
  id: string;
  setId: string;
  scope: string;
  localId: string;
  createdAt: Date;
};
export type SetItemRow = {
  setVersionId: string;
  questionId: string;
  position: number;
  text: string;
  citation: string;
  required: boolean;
  annexPoint: string | null;
  groupLabel: string | null;
};
export type QuestionnaireRow = {
  id: string;
  name: string;
  description: string;
  origin: string;
  listed: boolean;
  retiredAt: Date | null;
  createdAt: Date;
  createdBy: string;
};
export type QuestionnaireVersionRow = {
  id: string;
  questionnaireId: string;
  number: number;
  blocks: string[];
  createdAt: Date;
  createdBy: string;
};
export type QuestionnaireItemRow = {
  questionnaireVersionId: string;
  position: number;
  setVersionId: string;
  questionId: string;
};

/** A questionnaire version and what it needs that does not exist yet, written together. */
export type QuestionnaireVersionInsert = {
  /** Present when the questionnaire is new. */
  questionnaire?: {
    id: string;
    name: string;
    description: string;
    origin: string;
    listed: boolean;
    createdBy: string;
  };
  version: { id: string; questionnaireId: string; number: number; blocks: string[]; createdBy: string };
  items: Array<{ position: number; setVersionId: string; questionId: string }>;
};

/** A set version and what it needs that does not exist yet, written together. */
export type SetVersionInsert = {
  /** Present when the set is new. */
  set?: { id: string; name: string; description: string; origin: string; createdBy: string };
  version: { id: string; setId: string; number: number; createdBy: string };
  newQuestions: Array<{ id: string; setId: string; scope: string; localId: string }>;
  items: Array<Omit<SetItemRow, "setVersionId">>;
  /** The questionnaire made in the same transaction (T49 "Also make a questionnaire", T54). */
  questionnaire?: QuestionnaireVersionInsert;
};

type SeedSetQuestion = {
  localId: string;
  text: string;
  citation?: string;
  required?: boolean;
  annexPoint?: string | null;
  groupLabel?: string | null;
  /** Default `s-<set id>`. */
  scope?: string;
  /** Default `<set id>-<localId>`. */
  id?: string;
};

type Stamp = { createdBy?: string; createdAt?: Date };

const p2002 = (what: string) =>
  Object.assign(new Error(`Unique constraint failed on the fields: (${what})`), { code: "P2002" });
const p2003 = (what: string) =>
  Object.assign(new Error(`Foreign key constraint failed on the field: ${what}`), { code: "P2003" });

export class FakeQuestionnaireStore {
  sets: QuestionSetRow[] = [];
  setVersions: QuestionSetVersionRow[] = [];
  questions: QuestionRow[] = [];
  setItems: SetItemRow[] = [];
  questionnaires: QuestionnaireRow[] = [];
  questionnaireVersions: QuestionnaireVersionRow[] = [];
  questionnaireItems: QuestionnaireItemRow[] = [];
  /** Every insertSetVersion / insertQuestionnaireVersion plan that was written, in order. */
  inserted: Array<SetVersionInsert | QuestionnaireVersionInsert> = [];
  /** Every method call, by name. */
  calls: string[] = [];
  /** When set, the next insert finds its version number taken by a concurrent save (P2002). */
  raceOnNextInsert = false;
  /** When set, the next insert of a NEW set or questionnaire finds its name taken meanwhile (P2002). */
  nameRaceOnNextInsert = false;

  private t = 0;
  /** The fake's clock for rows seeded without a date: 2026-09-25T09:00:01Z, :02, ... */
  private tick() {
    this.t += 1;
    return new Date(Date.UTC(2026, 8, 25, 9, 0, this.t));
  }

  // ── seeding ────────────────────────────────────────────────────────────

  /**
   * The builtin rows as the two-level migration makes them: set "Annex IV" (annex-iv) v1
   * (annex-iv-v1) with the 14 questions, and questionnaire "Annex IV default"
   * (annex-iv-default) v1 (annex-iv-default-v1), all 9 blocks, 14 items pinned to annex-iv-v1.
   * created_by "system".
   */
  seedAnnex(): this {
    const at = this.tick();
    this.sets.push({
      id: "annex-iv", name: "Annex IV", description: ANNEX_DESCRIPTION, origin: "builtin",
      retiredAt: null, createdAt: at, createdBy: "system",
    });
    this.setVersions.push({ id: "annex-iv-v1", setId: "annex-iv", number: 1, createdAt: at, createdBy: "system" });
    this.questionnaires.push({
      id: "annex-iv-default", name: "Annex IV default", description: ANNEX_DESCRIPTION, origin: "builtin",
      listed: true, retiredAt: null, createdAt: at, createdBy: "system",
    });
    this.questionnaireVersions.push({
      id: "annex-iv-default-v1", questionnaireId: "annex-iv-default", number: 1, blocks: [...ALL_BLOCKS],
      createdAt: at, createdBy: "system",
    });
    KEY_QUESTIONS.forEach((k, position) => {
      const id = `annex-iv-${k.id}`;
      this.questions.push({ id, setId: "annex-iv", scope: k.group, localId: k.id, createdAt: at });
      this.setItems.push({
        setVersionId: "annex-iv-v1", questionId: id, position, text: k.text, citation: k.citation,
        required: !k.optional, annexPoint: k.id, groupLabel: k.groupLabel,
      });
      this.questionnaireItems.push({
        questionnaireVersionId: "annex-iv-default-v1", position, setVersionId: "annex-iv-v1", questionId: id,
      });
    });
    return this;
  }

  /**
   * A set with versions `<id>-v1`, `<id>-v2`, ... Each version lists its questions in order;
   * a question is created on first sight (id `<set id>-<localId>`, scope `s-<set id>`,
   * unless given).
   */
  addSet(spec: {
    id: string;
    name: string;
    description?: string;
    origin?: string;
    retiredAt?: Date | null;
    createdBy?: string;
    createdAt?: Date;
    versions: Array<Stamp & { questions: SeedSetQuestion[] }>;
  }): this {
    this.sets.push({
      id: spec.id,
      name: spec.name,
      description: spec.description ?? "",
      origin: spec.origin ?? "builder",
      retiredAt: spec.retiredAt ?? null,
      createdAt: spec.createdAt ?? this.tick(),
      createdBy: spec.createdBy ?? "alice",
    });
    spec.versions.forEach((v, i) => {
      const versionId = `${spec.id}-v${i + 1}`;
      this.setVersions.push({
        id: versionId, setId: spec.id, number: i + 1,
        createdAt: v.createdAt ?? this.tick(), createdBy: v.createdBy ?? spec.createdBy ?? "alice",
      });
      v.questions.forEach((q, position) => {
        const id = q.id ?? `${spec.id}-${q.localId}`;
        if (!this.questions.some((row) => row.id === id)) {
          this.questions.push({
            id, setId: spec.id, scope: q.scope ?? `s-${spec.id}`, localId: q.localId, createdAt: this.tick(),
          });
        }
        this.setItems.push({
          setVersionId: versionId, questionId: id, position, text: q.text, citation: q.citation ?? "",
          required: q.required ?? true, annexPoint: q.annexPoint ?? null, groupLabel: q.groupLabel ?? null,
        });
      });
    });
    return this;
  }

  /**
   * A questionnaire with versions `<id>-v1`, `<id>-v2`, ... Each item names a set item that must
   * exist already: `{setVersionId, questionId}`.
   */
  addQuestionnaire(spec: {
    id: string;
    name: string;
    description?: string;
    origin?: string;
    listed?: boolean;
    retiredAt?: Date | null;
    createdBy?: string;
    createdAt?: Date;
    versions: Array<Stamp & { blocks?: string[]; items: Array<{ setVersionId: string; questionId: string }> }>;
  }): this {
    this.questionnaires.push({
      id: spec.id,
      name: spec.name,
      description: spec.description ?? "",
      origin: spec.origin ?? "builder",
      listed: spec.listed ?? true,
      retiredAt: spec.retiredAt ?? null,
      createdAt: spec.createdAt ?? this.tick(),
      createdBy: spec.createdBy ?? "alice",
    });
    spec.versions.forEach((v, i) => {
      const versionId = `${spec.id}-v${i + 1}`;
      this.questionnaireVersions.push({
        id: versionId, questionnaireId: spec.id, number: i + 1, blocks: v.blocks ?? [],
        createdAt: v.createdAt ?? this.tick(), createdBy: v.createdBy ?? spec.createdBy ?? "alice",
      });
      v.items.forEach((it, position) => {
        if (!this.setItem(it.setVersionId, it.questionId)) {
          throw new Error(`seed: ${it.setVersionId}/${it.questionId} is not a set item`);
        }
        this.questionnaireItems.push({ questionnaireVersionId: versionId, position, ...it });
      });
    });
    return this;
  }

  // ── reads shared by both repositories ─────────────────────────────────

  private set(id: string) {
    return this.sets.find((s) => s.id === id) ?? null;
  }
  private setItem(setVersionId: string, questionId: string) {
    return this.setItems.find((i) => i.setVersionId === setVersionId && i.questionId === questionId) ?? null;
  }
  private question(id: string) {
    return this.questions.find((q) => q.id === id) ?? null;
  }

  private setVersionShape(v: QuestionSetVersionRow) {
    return {
      ...v,
      set: { ...this.set(v.setId)! },
      items: this.setItems
        .filter((i) => i.setVersionId === v.id)
        .sort((a, b) => a.position - b.position)
        .map((i) => ({ ...i, question: { ...this.question(i.questionId)! } })),
    };
  }

  private questionnaireVersionShape(v: QuestionnaireVersionRow) {
    return {
      ...v,
      blocks: [...v.blocks],
      questionnaire: { ...this.questionnaires.find((q) => q.id === v.questionnaireId)! },
      items: this.questionnaireItems
        .filter((i) => i.questionnaireVersionId === v.id)
        .sort((a, b) => a.position - b.position)
        .map((i) => {
          const setItem = this.setItem(i.setVersionId, i.questionId)!;
          const sv = this.setVersions.find((x) => x.id === i.setVersionId)!;
          return {
            ...i,
            setItem: {
              ...setItem,
              question: { ...this.question(i.questionId)! },
              setVersion: { ...sv, set: { ...this.set(sv.setId)! } },
            },
          };
        }),
    };
  }

  // ── QuestionSetRepository ──────────────────────────────────────────────

  async listSets() {
    this.calls.push("listSets");
    return this.sets.map((s) => ({ ...s }));
  }

  async findSet(id: string) {
    this.calls.push("findSet");
    const s = this.set(id);
    return s ? { ...s } : null;
  }

  async findSetVersion(id: string) {
    this.calls.push("findSetVersion");
    const v = this.setVersions.find((x) => x.id === id);
    return v ? this.setVersionShape(v) : null;
  }

  async setVersionsOf(setId: string) {
    this.calls.push("setVersionsOf");
    return this.setVersions
      .filter((v) => v.setId === setId)
      .sort((a, b) => a.number - b.number)
      .map((v) => this.setVersionShape(v));
  }

  async findQuestion(id: string) {
    this.calls.push("findQuestion");
    const q = this.question(id);
    return q ? { ...q } : null;
  }

  async questionsOf(setId: string) {
    this.calls.push("questionsOf");
    return this.questions.filter((q) => q.setId === setId).map((q) => ({ ...q }));
  }

  async insertSetVersion(plan: SetVersionInsert) {
    this.calls.push("insertSetVersion");
    const race = this.takeRaces(!!plan.set);
    // everything is checked before anything is written: one transaction
    const setRow = plan.set ?? this.set(plan.version.setId);
    if (!setRow) throw p2003("question_set_version_set_id_fkey");
    if (plan.set) this.checkSetName(plan.set.name, race.name);
    else if (race.name) throw p2002("lower(name)");
    if (!plan.set) {
      const existing = this.set(plan.version.setId)!;
      if (existing.origin === "builtin" && this.setVersions.some((v) => v.setId === existing.id)) {
        throw new Error(`question set ${existing.id} is builtin: it has one version, made by a migration`);
      }
      if (existing.retiredAt !== null) {
        throw new Error(`question set ${existing.id} is retired: it gets no new version`);
      }
    }
    if (race.number || this.setVersions.some((v) => v.setId === plan.version.setId && v.number === plan.version.number)) {
      throw p2002("`set_id`,`number`");
    }
    for (const q of plan.newQuestions) {
      if (this.questions.some((x) => x.id === q.id || (x.scope === q.scope && x.localId === q.localId))) {
        throw p2002("`scope`,`local_id`");
      }
    }
    for (const it of plan.items) {
      const q = this.question(it.questionId) ?? plan.newQuestions.find((n) => n.id === it.questionId);
      if (!q) throw p2003("question_set_version_item_question_id_fkey");
      if (q.setId !== plan.version.setId) {
        throw new Error(`question ${it.questionId} is not a question of the set of version ${plan.version.id}`);
      }
    }
    const positions = plan.items.map((i) => i.position);
    if (new Set(positions).size !== positions.length) throw p2002("`set_version_id`,`position`");
    if (plan.questionnaire) this.checkQuestionnairePlan(plan.questionnaire, false, plan);

    this.inserted.push(plan);
    const at = this.tick();
    if (plan.set) this.sets.push({ ...plan.set, retiredAt: null, createdAt: at });
    for (const q of plan.newQuestions) this.questions.push({ ...q, createdAt: at });
    this.setVersions.push({ ...plan.version, createdAt: at });
    for (const it of plan.items) this.setItems.push({ ...it, setVersionId: plan.version.id });
    if (plan.questionnaire) this.writeQuestionnairePlan(plan.questionnaire, at);
  }

  async retireSet(id: string, at: Date) {
    this.calls.push("retireSet");
    const s = this.set(id);
    if (!s) return;
    if (s.origin === "builtin") throw new Error('new row violates check constraint "question_set_builtin_is_annex_iv"');
    if (s.retiredAt !== null) {
      throw new Error(`question set ${id} keeps its name, origin and author; it can only be retired, once`);
    }
    s.retiredAt = at;
  }

  // ── QuestionnaireRepository ────────────────────────────────────────────

  async listQuestionnaires() {
    this.calls.push("listQuestionnaires");
    return this.questionnaires.map((q) => ({ ...q }));
  }

  async findQuestionnaire(id: string) {
    this.calls.push("findQuestionnaire");
    const q = this.questionnaires.find((x) => x.id === id);
    return q ? { ...q } : null;
  }

  async findQuestionnaireVersion(id: string) {
    this.calls.push("findQuestionnaireVersion");
    const v = this.questionnaireVersions.find((x) => x.id === id);
    return v ? this.questionnaireVersionShape(v) : null;
  }

  async questionnaireVersionsOf(questionnaireId: string) {
    this.calls.push("questionnaireVersionsOf");
    return this.questionnaireVersions
      .filter((v) => v.questionnaireId === questionnaireId)
      .sort((a, b) => a.number - b.number)
      .map((v) => this.questionnaireVersionShape(v));
  }

  async insertQuestionnaireVersion(plan: QuestionnaireVersionInsert) {
    this.calls.push("insertQuestionnaireVersion");
    const race = this.takeRaces(!!plan.questionnaire);
    this.checkQuestionnairePlan(plan, race.number, undefined, race.name);
    this.inserted.push(plan);
    this.writeQuestionnairePlan(plan, this.tick());
  }

  async retireQuestionnaire(id: string, at: Date) {
    this.calls.push("retireQuestionnaire");
    const q = this.questionnaires.find((x) => x.id === id);
    if (!q) return;
    if (q.origin === "builtin") {
      throw new Error('new row violates check constraint "questionnaire_builtin_is_the_default"');
    }
    if (q.retiredAt !== null) {
      throw new Error(`questionnaire ${id} keeps its name, origin, listing and author; it can only be retired, once`);
    }
    q.retiredAt = at;
  }

  // ── internals ──────────────────────────────────────────────────────────

  private takeRaces(isNew: boolean) {
    const number = this.raceOnNextInsert;
    const name = isNew && this.nameRaceOnNextInsert;
    this.raceOnNextInsert = false;
    if (isNew) this.nameRaceOnNextInsert = false;
    return { number, name };
  }

  private checkSetName(name: string, raced: boolean) {
    const lower = name.toLowerCase();
    if (raced || this.sets.some((s) => s.retiredAt === null && s.name.toLowerCase() === lower)) {
      throw p2002("lower(name)");
    }
  }

  private checkQuestionnairePlan(
    plan: QuestionnaireVersionInsert,
    raced: boolean,
    withSet?: SetVersionInsert,
    nameRaced = false,
  ) {
    const q = plan.questionnaire ?? this.questionnaires.find((x) => x.id === plan.version.questionnaireId);
    if (!q) throw p2003("questionnaire_version_questionnaire_id_fkey");
    if (plan.questionnaire) {
      const lower = plan.questionnaire.name.toLowerCase();
      if (
        nameRaced ||
        (plan.questionnaire.listed &&
          this.questionnaires.some((x) => x.listed && x.retiredAt === null && x.name.toLowerCase() === lower))
      ) {
        throw p2002("lower(name)");
      }
    } else {
      const existing = this.questionnaires.find((x) => x.id === plan.version.questionnaireId)!;
      if (existing.origin === "builtin" && this.questionnaireVersions.some((v) => v.questionnaireId === existing.id)) {
        throw new Error(`questionnaire ${existing.id} is builtin: it has one version, made by a migration`);
      }
      if (existing.retiredAt !== null) {
        throw new Error(`questionnaire ${existing.id} is retired: it gets no new version`);
      }
    }
    if (
      raced ||
      this.questionnaireVersions.some(
        (v) => v.questionnaireId === plan.version.questionnaireId && v.number === plan.version.number,
      )
    ) {
      throw p2002("`questionnaire_id`,`number`");
    }
    const ids = plan.items.map((i) => i.questionId);
    if (new Set(ids).size !== ids.length) throw p2002("`questionnaire_version_id`,`question_id`");
    const positions = plan.items.map((i) => i.position);
    if (new Set(positions).size !== positions.length) throw p2002("`questionnaire_version_id`,`position`");
    for (const it of plan.items) {
      const inPlan =
        withSet !== undefined &&
        withSet.version.id === it.setVersionId &&
        withSet.items.some((x) => x.questionId === it.questionId);
      if (!inPlan && !this.setItem(it.setVersionId, it.questionId)) {
        throw p2003("questionnaire_version_item_set_item_fkey");
      }
    }
  }

  private writeQuestionnairePlan(plan: QuestionnaireVersionInsert, at: Date) {
    if (plan.questionnaire) this.questionnaires.push({ ...plan.questionnaire, retiredAt: null, createdAt: at });
    this.questionnaireVersions.push({ ...plan.version, blocks: [...plan.version.blocks], createdAt: at });
    for (const it of plan.items) this.questionnaireItems.push({ ...it, questionnaireVersionId: plan.version.id });
  }
}

/** Ids for the services' `newId` option: unique, lowercase, valid in a scope. */
export function idCounter(prefix = "id") {
  let n = 0;
  return () => `${prefix}${++n}`;
}
