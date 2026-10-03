import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AnnexPointId } from "@/domain/forms/annexPoints";
import { FORM_BLOCKS } from "@/domain/forms/blocks";
import { ANNEX_SET_ID } from "@/domain/forms/legacy";
import type { SetGroup } from "@/domain/forms/library";
import { parseSetDraft, sameSetContent } from "@/domain/forms/questionSetDraft";
import type { ResolvedQuestion, ResolvedSetVersion, VersionStamp } from "@/domain/forms/types";
import {
  QuestionSetRepository,
  type QuestionnaireVersionInsert,
  type SetVersionInsert,
  type SetVersionRow,
} from "@/server/repositories/QuestionSetRepository";

/** One row of the question-set list page (T20, T45). */
export type SetListRow = {
  setId: string;
  name: string;
  description: string;
  origin: string;
  builtin: boolean;
  versionId: string;
  version: number;
  questionCount: number;
  savedBy: string;
  savedAt: string;
  retiredAt: string | null;
};

/** What a forms save wrote, for its ledger events (ledger phase 5). `created` is a new set or
 *  questionnaire; otherwise it is the next version of an existing one. */
export type SetSaved = {
  id: string;
  number: number;
  created: boolean;
  added: number;
  removed: number;
  reworded: number;
  content: unknown;
};
export type QuestionnaireSaved = {
  id: string;
  versionId: string;
  number: number;
  created: boolean;
  listed: boolean;
  items: number;
  blocks: number;
  content: unknown;
};
export type FormsSaved = { set?: SetSaved; questionnaire?: QuestionnaireSaved };
/** The action's ledger events for a save, written in its transaction. */
export type FormsRecorder = (tx: Prisma.TransactionClient, saved: FormsSaved) => Promise<unknown>;

/** The summary of a questionnaire plan, for its ledger event. */
export function questionnaireSaved(plan: QuestionnaireVersionInsert): QuestionnaireSaved {
  return {
    id: plan.version.questionnaireId,
    versionId: plan.version.id,
    number: plan.version.number,
    created: plan.questionnaire !== undefined,
    listed: plan.questionnaire?.listed ?? true,
    items: plan.items.length,
    blocks: plan.version.blocks.length,
    content: { questionnaire: plan.questionnaire ?? null, version: plan.version, items: plan.items },
  };
}

export type SaveSetOptions = {
  /** The caller's ledger events, in the save's transaction (ledger phase 5). */
  record?: FormsRecorder;
  /** The set to save the next version of; absent for a new set. */
  setId?: string;
  origin?: "builder" | "import";
  createdBy: string;
  /** Also make a listed questionnaire with all the new set's questions, in the same transaction (T49). */
  alsoQuestionnaire?: boolean;
};

export type SaveSetResult =
  | { ok: true; setId: string; versionId: string; number: number; created: boolean; questionnaireId?: string }
  | { ok: false; error: string };

/** A set item as a reader sees it: identity, wording and the set version it is from. */
type SetItemLike = {
  questionId: string;
  text: string;
  citation: string;
  required: boolean;
  annexPoint: string | null;
  groupLabel: string | null;
  question: { id: string; scope: string; localId: string };
};
type SetVersionLike = { id: string; number: number; set: { id: string; name: string; origin: string } };

/** One question of a set version, resolved (spec 5.1). */
export function toResolvedQuestion(item: SetItemLike, version: SetVersionLike): ResolvedQuestion {
  const { scope, localId } = item.question;
  return {
    questionId: item.question.id,
    scope,
    localId,
    key: `${scope}:${localId}`,
    field: `q:${scope}:${localId}`,
    text: item.text,
    citation: item.citation,
    required: item.required,
    annexPoint: item.annexPoint as AnnexPointId | null,
    groupLabel: item.groupLabel,
    setId: version.set.id,
    setName: version.set.name,
    setVersionId: version.id,
    setVersionNumber: version.number,
    setBuiltin: version.set.origin === "builtin",
  };
}

/** A set version row, resolved. */
export function toResolvedSetVersion(row: SetVersionRow): ResolvedSetVersion {
  return {
    setId: row.set.id,
    setName: row.set.name,
    description: row.set.description,
    origin: row.set.origin as ResolvedSetVersion["origin"],
    builtin: row.set.origin === "builtin",
    retired: row.set.retiredAt !== null,
    versionId: row.id,
    versionNumber: row.number,
    questions: row.items.map((i) => toResolvedQuestion(i, row)),
  };
}

export const stampOf = (v: { id: string; number: number; createdAt: Date; createdBy: string }): VersionStamp => ({
  versionId: v.id,
  number: v.number,
  createdAt: v.createdAt.toISOString(),
  createdBy: v.createdBy,
});

/** Annex IV first, then by name ignoring case. */
export function libraryOrder<T extends { id: string; name: string }>(a: T, b: T, builtinId: string): number {
  if (a.id === builtinId) return -1;
  if (b.id === builtinId) return 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id);
}

/** n of a local id `q<n>`; 0 for any other (the builtin "1a" ...). */
function localNumber(localId: string): number {
  const m = /^q(\d+)$/.exec(localId);
  return m ? Number(m[1]) : 0;
}

/** Which unique key a P2002 hit, as far as its message and meta tell. */
export function uniqueConflict(err: unknown): "questionnaireName" | "name" | "number" | "other" | null {
  if ((err as { code?: unknown })?.code !== "P2002") return null;
  const text = `${(err as Error).message ?? ""} ${JSON.stringify((err as { meta?: unknown }).meta ?? {})}`;
  if (/questionnaire_listed_name_key/.test(text)) return "questionnaireName";
  if (/name/.test(text)) return "name";
  if (/number/.test(text)) return "number";
  return "other";
}

/**
 * Whether a write lost a race with a retire (05-verification H12): the save met
 * the `_is_allowed` trigger ("is retired: it gets no new version"), or a second
 * retire met the `_row_is_fixed` trigger ("it can only be retired, once").
 * Read from the error text, the only place Prisma carries a trigger's message.
 */
export function retireRace(err: unknown): "saveAfterRetire" | "retiredTwice" | null {
  const text = `${(err as Error)?.message ?? ""} ${JSON.stringify((err as { meta?: unknown })?.meta ?? {})}`;
  if (/is retired: it gets no new version/.test(text)) return "saveAfterRetire";
  if (/it can only be retired, once/.test(text)) return "retiredTwice";
  return null;
}

const RACED = "This question set was saved by someone else meanwhile. Reload it and save again.";

/**
 * The install's question sets: where questions are written. The install is the
 * organisation: there is one library, the same for every project.
 *
 * A save never changes a version: it makes the next one, or nothing when the
 * content is unchanged. Question identities are minted here, keyed
 * `s-<set id>:q<n>`, with n never reused within a set. A set's name and
 * description are fixed at creation; Annex IV is read-only.
 */
export class QuestionSetService {
  private readonly newId: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly repository: QuestionSetRepository,
    {
      newId = () => randomUUID(),
      now = () => new Date(),
    }: { newId?: () => string; now?: () => Date } = {},
  ) {
    this.newId = newId;
    this.now = now;
  }

  /** The list page's rows: the non-retired sets, or with `retired` only the retired ones. */
  async list({ retired = false }: { retired?: boolean } = {}): Promise<SetListRow[]> {
    const sets = (await this.repository.listSets())
      .filter((s) => (s.retiredAt !== null) === retired)
      .sort((a, b) => libraryOrder(a, b, ANNEX_SET_ID));
    const rows: SetListRow[] = [];
    for (const s of sets) {
      const versions = await this.repository.setVersionsOf(s.id);
      const latest = versions.at(-1);
      if (!latest) continue;
      rows.push({
        setId: s.id,
        name: s.name,
        description: s.description,
        origin: s.origin,
        builtin: s.origin === "builtin",
        versionId: latest.id,
        version: latest.number,
        questionCount: latest.items.length,
        savedBy: latest.createdBy,
        savedAt: latest.createdAt.toISOString(),
        retiredAt: s.retiredAt ? s.retiredAt.toISOString() : null,
      });
    }
    return rows;
  }

  /** Every set's latest version, retired ones included and flagged, Annex IV first (T45). */
  async groups(): Promise<SetGroup[]> {
    const sets = (await this.repository.listSets()).sort((a, b) => libraryOrder(a, b, ANNEX_SET_ID));
    const groups: SetGroup[] = [];
    for (const s of sets) {
      const latest = (await this.repository.setVersionsOf(s.id)).at(-1);
      if (!latest) continue;
      const resolved = toResolvedSetVersion(latest);
      groups.push({
        setId: resolved.setId,
        setName: resolved.setName,
        versionId: resolved.versionId,
        versionNumber: resolved.versionNumber,
        retired: resolved.retired,
        questions: resolved.questions,
      });
    }
    return groups;
  }

  /** One set version, whatever came after it; null for an unknown id. */
  async resolveSetVersion(id: string): Promise<ResolvedSetVersion | null> {
    const row = await this.repository.findSetVersion(id);
    return row ? toResolvedSetVersion(row) : null;
  }

  /** A set's latest version, or null. */
  async latest(setId: string): Promise<ResolvedSetVersion | null> {
    return this.atNumber(setId);
  }

  /** A set's version `n` (its latest without one), or null. */
  async atNumber(setId: string, n?: number): Promise<ResolvedSetVersion | null> {
    const versions = await this.repository.setVersionsOf(setId);
    const row = n === undefined ? versions.at(-1) : versions.find((v) => v.number === n);
    return row ? toResolvedSetVersion(row) : null;
  }

  /** Who saved each version and when, newest first (T57). */
  async history(setId: string): Promise<VersionStamp[]> {
    return (await this.repository.setVersionsOf(setId)).map(stampOf).reverse();
  }

  /** Saves a new set, or the next version of `opts.setId` (T14, T15, T49). */
  async saveDraft(input: unknown, opts: SaveSetOptions): Promise<SaveSetResult> {
    if (opts.setId !== undefined) return this.saveNextVersion(input, opts.setId, opts.createdBy, opts.record);
    return this.saveNewSet(input, opts);
  }

  /** Retires a set: hidden from lists and pickers, still resolvable (T19). */
  async retire(
    setId: string,
    record?: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const set = await this.repository.findSet(setId);
    if (set?.origin === "builtin") return { ok: false, error: "Annex IV cannot be retired." };
    if (!set || set.retiredAt !== null) return { ok: false, error: "That question set cannot be retired." };
    try {
      await this.repository.retireSet(setId, this.now(), record);
    } catch (err) {
      if (retireRace(err) === "retiredTwice") return { ok: false, error: "That question set cannot be retired." };
      throw err;
    }
    return { ok: true };
  }

  // ── internals ───────────────────────────────────────────────────────────

  private async saveNewSet(input: unknown, opts: SaveSetOptions): Promise<SaveSetResult> {
    const taken = (await this.repository.listSets()).filter((s) => s.retiredAt === null).map((s) => s.name);
    const parsed = parseSetDraft(input, { takenNames: taken });
    if (!parsed.ok) return parsed;
    const { value } = parsed;

    if (opts.alsoQuestionnaire) {
      const lower = value.name.toLowerCase();
      const questionnaires = await this.repository.listQuestionnaires();
      if (questionnaires.some((q) => q.listed && q.retiredAt === null && q.name.trim().toLowerCase() === lower)) {
        return { ok: false, error: `A questionnaire called ${value.name} already exists.` };
      }
    }

    const setId = this.newId();
    const versionId = this.newId();
    const newQuestions: SetVersionInsert["newQuestions"] = [];
    const items: SetVersionInsert["items"] = value.questions.map((q, position) => {
      const id = this.newId();
      newQuestions.push({ id, setId, scope: `s-${setId}`, localId: `q${position + 1}` });
      return {
        questionId: id,
        position,
        text: q.text,
        citation: q.citation,
        required: q.required,
        annexPoint: q.annexPoint,
        groupLabel: null,
      };
    });
    const origin = opts.origin ?? "builder";
    let questionnaireId: string | undefined;
    let questionnaire: SetVersionInsert["questionnaire"];
    if (opts.alsoQuestionnaire) {
      questionnaireId = this.newId();
      questionnaire = {
        questionnaire: {
          id: questionnaireId,
          name: value.name,
          description: value.description ?? "",
          origin: "import",
          listed: true,
          createdBy: opts.createdBy,
        },
        version: {
          id: this.newId(),
          questionnaireId,
          number: 1,
          blocks: [...FORM_BLOCKS],
          createdBy: opts.createdBy,
        },
        items: items.map((i) => ({ position: i.position, setVersionId: versionId, questionId: i.questionId })),
      };
    }

    const plan: SetVersionInsert = {
      set: { id: setId, name: value.name, description: value.description ?? "", origin, createdBy: opts.createdBy },
      version: { id: versionId, setId, number: 1, createdBy: opts.createdBy },
      newQuestions,
      items,
      ...(questionnaire ? { questionnaire } : {}),
    };
    try {
      await this.repository.insertSetVersion(plan, opts.record && ((tx) => opts.record!(tx, {
        set: { id: setId, number: 1, created: true, added: items.length, removed: 0, reworded: 0, content: plan },
        ...(questionnaire ? { questionnaire: questionnaireSaved(questionnaire) } : {}),
      })));
    } catch (err) {
      const conflict = uniqueConflict(err);
      if (conflict === "questionnaireName") {
        return { ok: false, error: `A questionnaire called ${value.name} already exists.` };
      }
      if (conflict !== null) return { ok: false, error: `A question set called ${value.name} already exists.` };
      throw err;
    }
    return {
      ok: true,
      setId,
      versionId,
      number: 1,
      created: true,
      ...(questionnaireId ? { questionnaireId } : {}),
    };
  }

  private async saveNextVersion(
    input: unknown,
    setId: string,
    createdBy: string,
    record?: FormsRecorder,
  ): Promise<SaveSetResult> {
    const set = await this.repository.findSet(setId);
    if (!set || set.origin === "builtin" || set.retiredAt !== null) {
      return { ok: false, error: "That question set cannot be changed." };
    }
    // The name and description are fixed at creation (D21): the draft's are not read.
    const draft = input !== null && typeof input === "object" && !Array.isArray(input)
      ? { ...(input as Record<string, unknown>), name: set.name, description: set.description }
      : input;
    const parsed = parseSetDraft(draft);
    if (!parsed.ok) return parsed;
    const { value } = parsed;

    const versions = await this.repository.setVersionsOf(setId);
    const latestRow = versions.at(-1);
    for (const [i, q] of value.questions.entries()) {
      if (q.questionId === undefined) continue;
      const known = await this.repository.findQuestion(q.questionId);
      if (!known) return { ok: false, error: `Question ${i + 1} no longer exists.` };
      if (known.setId !== setId) return { ok: false, error: `Question ${i + 1} belongs to another question set.` };
    }
    if (latestRow && sameSetContent(value, toResolvedSetVersion(latestRow))) {
      return { ok: true, setId, versionId: latestRow.id, number: latestRow.number, created: false };
    }

    // An existing question keeps the group label its set last gave it (D19).
    const labelOf = (questionId: string): string | null => {
      for (let v = versions.length - 1; v >= 0; v--) {
        const item = versions[v].items.find((i) => i.questionId === questionId);
        if (item) return item.groupLabel;
      }
      return null;
    };
    let next = Math.max(0, ...(await this.repository.questionsOf(setId)).map((q) => localNumber(q.localId)));
    const newQuestions: SetVersionInsert["newQuestions"] = [];
    const items: SetVersionInsert["items"] = value.questions.map((q, position) => {
      let questionId = q.questionId;
      if (questionId === undefined) {
        questionId = this.newId();
        next += 1;
        newQuestions.push({ id: questionId, setId, scope: `s-${setId}`, localId: `q${next}` });
      }
      return {
        questionId,
        position,
        text: q.text,
        citation: q.citation,
        required: q.required,
        annexPoint: q.annexPoint,
        groupLabel: q.questionId === undefined ? null : labelOf(q.questionId),
      };
    });
    const number = (latestRow?.number ?? 0) + 1;
    const versionId = this.newId();
    // What changed against the latest version, for the ledger (question_set.version_created)
    const was = new Map((latestRow?.items ?? []).map((i) => [i.questionId, i.text]));
    const now = new Set(items.map((i) => i.questionId));
    const change = {
      added: items.filter((i) => !was.has(i.questionId)).length,
      removed: [...was.keys()].filter((id) => !now.has(id)).length,
      reworded: items.filter((i) => was.has(i.questionId) && was.get(i.questionId) !== i.text).length,
    };
    const plan: SetVersionInsert = { version: { id: versionId, setId, number, createdBy }, newQuestions, items };
    try {
      await this.repository.insertSetVersion(plan, record && ((tx) => record(tx, {
        set: { id: setId, number, created: false, ...change, content: plan },
      })));
    } catch (err) {
      if (uniqueConflict(err) !== null) return { ok: false, error: RACED };
      if (retireRace(err) === "saveAfterRetire") return { ok: false, error: "That question set cannot be changed." };
      throw err;
    }
    return { ok: true, setId, versionId, number, created: true };
  }
}

/**
 * The question sets of one project, on a database a door has already opened
 * (src/lib/projectDb.ts). A project's sets live in its own database; the
 * builtin Annex IV set is seeded into every one by the forms migrations.
 */
export function questionSetsOn(db: PrismaClient): QuestionSetService {
  return new QuestionSetService(new QuestionSetRepository(db));
}
