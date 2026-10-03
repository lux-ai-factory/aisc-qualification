import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { projectDbPastDoor } from "@/lib/projectDb";
import { inBlockOrder, type FormBlock } from "@/domain/forms/blocks";
import { annexDefaultVersion, DEFAULT_QUESTIONNAIRE_ID } from "@/domain/forms/legacy";
import { updatesAvailable, type SetGroup } from "@/domain/forms/library";
import { parseQuestionnaireDraft, sameQuestionnaireContent } from "@/domain/forms/questionnaireDraft";
import { parseSetDraft } from "@/domain/forms/questionSetDraft";
import { missingReferences, type FoundSetVersion, type ReferenceItem } from "@/domain/forms/references";
import type {
  QuestionnaireResolver,
  ResolvedQuestion,
  ResolvedQuestionnaireVersion,
  VersionStamp,
} from "@/domain/forms/types";
// useOnceFormName is a plain function, not a hook: renamed so the hook lint rule does not apply to it.
import { useOnceFormName as oneUseFormName } from "@/domain/forms/useOnceName";
import {
  QuestionnaireRepository,
  type QuestionnaireVersionInsert,
  type QuestionnaireVersionRow,
} from "@/server/repositories/QuestionnaireRepository";
import type { SetVersionInsert, SetVersionRow } from "@/server/repositories/QuestionSetRepository";
import {
  libraryOrder,
  questionnaireSaved,
  QuestionSetService,
  retireRace,
  type FormsRecorder,
  stampOf,
  toResolvedQuestion,
  uniqueConflict,
} from "@/server/services/QuestionSetService";

/** One row of the questionnaire list page. */
export type QuestionnaireLibraryRow = {
  questionnaireId: string;
  name: string;
  description: string;
  origin: string;
  builtin: boolean;
  /** From the constant DEFAULT_QUESTIONNAIRE_ID: there is no default flag. */
  isDefault: boolean;
  versionId: string;
  version: number;
  questionCount: number;
  savedBy: string;
  savedAt: string;
  retiredAt: string | null;
  /** How many picks of the latest version have an update available. */
  updates: number;
};

/** A chooser option: a library row and every version id, oldest first. */
export type QuestionnaireChooserOption = QuestionnaireLibraryRow & { versionIds: string[] };

export type SaveQuestionnaireOptions = {
  /** The caller's ledger events, in the save's transaction. */
  record?: FormsRecorder;
  /** The questionnaire to save the next version of; absent for a new one. */
  questionnaireId?: string;
  /** false for "Use once": a new, unlisted questionnaire named after the system and the day. */
  listed: boolean;
  origin?: "builder" | "import";
  createdBy: string;
  /** The card's system name, for a use-once name. */
  systemName?: string;
};

export type SaveQuestionnaireResult =
  | { ok: true; questionnaireId: string; versionId: string; number: number; created: boolean }
  | { ok: false; error: string };

/** A self-contained questionnaire file as the prefill service reads it back. */
export type SelfContainedFile = {
  name?: string;
  description?: string;
  blocks: string[];
  items: Array<{
    setId?: string;
    setName?: string;
    setVersion?: number;
    scope?: string;
    localId?: string;
    text: string;
    citation: string;
    required: boolean;
    annexPoint: string | null;
    groupLabel: string | null;
  }>;
};

export type ResolvedReferences =
  | { ok: true; picks: Array<{ question: ResolvedQuestion; setVersionId: string }> }
  | { ok: false; missing: string[] };

/** The length bound of the group_label CHECK constraint, also applied to imported files. */
const MAX_GROUP_LABEL = 120;

const RACED = "This questionnaire was saved by someone else meanwhile. Reload it and save again.";

/** A questionnaire version row, resolved: the pinned wording of each item. */
function toResolvedQuestionnaireVersion(row: QuestionnaireVersionRow): ResolvedQuestionnaireVersion {
  const q = row.questionnaire;
  return {
    questionnaireId: q.id,
    questionnaireName: q.name,
    description: q.description,
    listed: q.listed,
    builtin: q.origin === "builtin",
    retired: q.retiredAt !== null,
    versionId: row.id,
    versionNumber: row.number,
    blocks: inBlockOrder(row.blocks),
    questions: row.items.map((i) => toResolvedQuestion(i.setItem, i.setItem.setVersion)),
  };
}

/**
 * The questionnaires of one library: what a card is filled with. The service never
 * names a project; the database its repository is bound to is the scope (see
 * questionnairesOn below). A questionnaire is
 * assembled only by picking questions from question-set versions; it never writes
 * or rewords a question. Each item is pinned to the set version whose wording it
 * shows, and never follows a newer one by itself. The default is always
 * "Annex IV default" (DEFAULT_QUESTIONNAIRE_ID), fixed.
 */
export class QuestionnaireService implements QuestionnaireResolver {
  private readonly newId: () => string;
  private readonly now: () => Date;
  private readonly sets: QuestionSetService;

  constructor(
    private readonly repository: QuestionnaireRepository,
    {
      newId = () => randomUUID(),
      now = () => new Date(),
    }: { newId?: () => string; now?: () => Date } = {},
  ) {
    this.newId = newId;
    this.now = now;
    this.sets = new QuestionSetService(repository, { newId, now });
  }

  /**
   * The version a card was filled with. NULL (a card saved before forms existed)
   * is the default version, answered in memory without the database. An
   * unknown id is null.
   */
  async resolve(id: string | null): Promise<ResolvedQuestionnaireVersion | null> {
    if (id === null) return annexDefaultVersion();
    const row = await this.repository.findQuestionnaireVersion(id);
    return row ? toResolvedQuestionnaireVersion(row) : null;
  }

  /** A questionnaire's latest version (listed, unlisted, builtin or retired), or null. */
  async latestVersion(questionnaireId: string): Promise<ResolvedQuestionnaireVersion | null> {
    return this.exportable(questionnaireId);
  }

  /** Version `n` of a questionnaire (its latest without one), whatever its listing; or null. */
  async exportable(questionnaireId: string, n?: number): Promise<ResolvedQuestionnaireVersion | null> {
    const versions = await this.repository.questionnaireVersionsOf(questionnaireId);
    const row = n === undefined ? versions.at(-1) : versions.find((v) => v.number === n);
    return row ? toResolvedQuestionnaireVersion(row) : null;
  }

  /** The listed questionnaires, non-retired (or with `retired` only the retired ones), default first. */
  async library({ retired = false }: { retired?: boolean } = {}): Promise<QuestionnaireLibraryRow[]> {
    return (await this.listed(retired)).map((l) => l.row);
  }

  /** The chooser's options: the current library, each with every version id, oldest first. */
  async chooserOptions(): Promise<QuestionnaireChooserOption[]> {
    return (await this.listed(false)).map(({ row, versionIds }) => ({ ...row, versionIds }));
  }

  /** Who saved each version and when, newest first. */
  async history(questionnaireId: string): Promise<VersionStamp[]> {
    return (await this.repository.questionnaireVersionsOf(questionnaireId)).map(stampOf).reverse();
  }

  /**
   * Saves the builder's draft: a new questionnaire's v1, or the next version of
   * `opts.questionnaireId`. `listed: false` is "Use once", named after the system
   * and the day, whatever the draft says. An existing questionnaire keeps its
   * name. Items name set items; their wording is never read from the draft.
   */
  async saveDraft(input: unknown, opts: SaveQuestionnaireOptions): Promise<SaveQuestionnaireResult> {
    const all = await this.repository.listQuestionnaires();
    let existing: (typeof all)[number] | undefined;
    let draftInput = input;
    let takenNames: string[] | undefined;
    if (opts.questionnaireId !== undefined) {
      existing = all.find((q) => q.id === opts.questionnaireId);
      if (!existing || existing.origin === "builtin" || !existing.listed || existing.retiredAt !== null) {
        return { ok: false, error: "That questionnaire cannot be changed." };
      }
      if (input !== null && typeof input === "object" && !Array.isArray(input)) {
        draftInput = { ...(input as Record<string, unknown>), name: existing.name };
      }
    } else if (opts.listed) {
      takenNames = all.filter((q) => q.listed && q.retiredAt === null).map((q) => q.name);
    }
    const parsed = parseQuestionnaireDraft(draftInput, takenNames ? { takenNames } : undefined);
    if (!parsed.ok) return parsed;
    const value = parsed.value;

    // every item must be a question as some set version words it
    const setVersions = new Map<string, SetVersionRow | null>();
    for (const [i, it] of value.items.entries()) {
      if (!setVersions.has(it.setVersionId)) {
        setVersions.set(it.setVersionId, await this.repository.findSetVersion(it.setVersionId));
      }
      const sv = setVersions.get(it.setVersionId);
      if (!sv || !sv.items.some((x) => x.questionId === it.questionId)) {
        return { ok: false, error: `Question ${i + 1} no longer exists.` };
      }
    }
    const blocks = inBlockOrder(value.blocks);
    const items = value.items.map((it, position) => ({ position, ...it }));

    if (existing) {
      const versions = await this.repository.questionnaireVersionsOf(existing.id);
      const latest = versions.at(-1);
      if (latest && sameQuestionnaireContent(value, toResolvedQuestionnaireVersion(latest))) {
        return { ok: true, questionnaireId: existing.id, versionId: latest.id, number: latest.number, created: false };
      }
      const number = (latest?.number ?? 0) + 1;
      const versionId = this.newId();
      const plan: QuestionnaireVersionInsert = {
        version: { id: versionId, questionnaireId: existing.id, number, blocks, createdBy: opts.createdBy },
        items,
      };
      try {
        await this.repository.insertQuestionnaireVersion(
          plan,
          opts.record && ((tx) => opts.record!(tx, { questionnaire: questionnaireSaved(plan) })),
        );
      } catch (err) {
        if (uniqueConflict(err) !== null) return { ok: false, error: RACED };
        if (retireRace(err) === "saveAfterRetire") return { ok: false, error: "That questionnaire cannot be changed." };
        throw err;
      }
      return { ok: true, questionnaireId: existing.id, versionId, number, created: true };
    }

    const name = opts.listed
      ? value.name
      : oneUseFormName(opts.systemName ?? value.name, this.now(), all.map((q) => q.name));
    const questionnaireId = this.newId();
    const versionId = this.newId();
    const plan: QuestionnaireVersionInsert = {
      questionnaire: {
        id: questionnaireId,
        name,
        description: value.description ?? "",
        origin: opts.origin ?? "builder",
        listed: opts.listed,
        createdBy: opts.createdBy,
      },
      version: { id: versionId, questionnaireId, number: 1, blocks, createdBy: opts.createdBy },
      items,
    };
    try {
      await this.repository.insertQuestionnaireVersion(
        plan,
        opts.record && ((tx) => opts.record!(tx, { questionnaire: questionnaireSaved(plan) })),
      );
    } catch (err) {
      if (uniqueConflict(err) !== null) return { ok: false, error: `A questionnaire called ${name} already exists.` };
      throw err;
    }
    return { ok: true, questionnaireId, versionId, number: 1, created: true };
  }

  /** Retires a listed questionnaire: hidden from lists and the chooser, still resolvable. */
  async retire(
    questionnaireId: string,
    record?: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const q = await this.repository.findQuestionnaire(questionnaireId);
    if (q?.id === DEFAULT_QUESTIONNAIRE_ID || q?.origin === "builtin") {
      return { ok: false, error: "The Annex IV default cannot be retired." };
    }
    if (!q || !q.listed || q.retiredAt !== null) return { ok: false, error: "That questionnaire cannot be retired." };
    try {
      await this.repository.retireQuestionnaire(questionnaireId, this.now(), record);
    } catch (err) {
      if (retireRace(err) === "retiredTwice") return { ok: false, error: "That questionnaire cannot be retired." };
      throw err;
    }
    return { ok: true };
  }

  /**
   * A references file's items, looked up on this install by (setId, setVersion)
   * and (scope, localId), never by name: the picks, pinned to the named
   * set versions, or every missing reference.
   */
  async resolveReferences(items: ReferenceItem[]): Promise<ResolvedReferences> {
    const versionsOf = new Map<string, SetVersionRow[]>();
    const found: FoundSetVersion[] = [];
    const rows = new Map<string, SetVersionRow>();
    for (const it of items) {
      if (!versionsOf.has(it.setId)) versionsOf.set(it.setId, await this.repository.setVersionsOf(it.setId));
      const row = versionsOf.get(it.setId)!.find((v) => v.number === it.setVersion);
      if (!row || rows.has(row.id)) continue;
      rows.set(row.id, row);
      found.push({
        setId: row.set.id,
        number: row.number,
        name: row.set.name,
        versionId: row.id,
        keys: row.items.map((i) => `${i.question.scope}:${i.question.localId}`),
      });
    }
    const missing = missingReferences(items, found);
    if (missing.length > 0) return { ok: false, missing };
    const picks = items.map((it) => {
      const row = [...rows.values()].find((r) => r.set.id === it.setId && r.number === it.setVersion)!;
      const item = row.items.find((i) => i.question.scope === it.scope && i.question.localId === it.localId)!;
      return { question: toResolvedQuestion(item, row), setVersionId: row.id };
    });
    return { ok: true, picks };
  }

  /**
   * A self-contained file: a new question set (origin import) holding the file's
   * wording as new questions s-<setId>:q1..qN, and a listed questionnaire v1 with
   * the file's blocks pinned to that set's v1, in one transaction.
   */
  async importSelfContained(
    file: SelfContainedFile,
    opts: { setName: string; questionnaireName: string; createdBy: string; record?: FormsRecorder },
  ): Promise<{ ok: true; setId: string; questionnaireId: string; versionId: string } | { ok: false; error: string }> {
    // The file comes back from the browser: every item and its groupLabel are checked
    // again here, with the prefill service's messages (it checked them once), so a
    // tampered POST gets a message, never the group_label CHECK error.
    for (const [i, it] of file.items.entries()) {
      const n = i + 1;
      if (it === null || typeof it !== "object" || Array.isArray(it)) {
        return { ok: false, error: `item ${n} has no setId` };
      }
      const label: unknown = (it as { groupLabel?: unknown }).groupLabel;
      if (
        label !== undefined &&
        label !== null &&
        !(typeof label === "string" && label.trim().length >= 1 && label.length <= MAX_GROUP_LABEL)
      ) {
        return { ok: false, error: `item ${n}: groupLabel must be text of at most ${MAX_GROUP_LABEL} characters or null` };
      }
    }
    const description = file.description ?? "";
    const takenSets = (await this.repository.listSets()).filter((s) => s.retiredAt === null).map((s) => s.name);
    const setDraft = parseSetDraft(
      {
        name: opts.setName,
        description,
        questions: file.items.map((i) => ({
          text: i.text,
          citation: i.citation,
          required: i.required,
          annexPoint: i.annexPoint,
        })),
      },
      { takenNames: takenSets },
    );
    if (!setDraft.ok) return setDraft;
    const takenQuestionnaires = (await this.repository.listQuestionnaires())
      .filter((q) => q.listed && q.retiredAt === null)
      .map((q) => q.name);
    const questionnaireDraft = parseQuestionnaireDraft(
      { name: opts.questionnaireName, description, blocks: file.blocks, items: [] },
      { takenNames: takenQuestionnaires },
    );
    if (!questionnaireDraft.ok) return questionnaireDraft;

    const setId = this.newId();
    const setVersionId = this.newId();
    const newQuestions: SetVersionInsert["newQuestions"] = [];
    const items: SetVersionInsert["items"] = setDraft.value.questions.map((q, position) => {
      const id = this.newId();
      newQuestions.push({ id, setId, scope: `s-${setId}`, localId: `q${position + 1}` });
      return {
        questionId: id,
        position,
        text: q.text,
        citation: q.citation,
        required: q.required,
        annexPoint: q.annexPoint,
        groupLabel: file.items[position].groupLabel ?? null,
      };
    });
    const questionnaireId = this.newId();
    const versionId = this.newId();
    const questionnaire: QuestionnaireVersionInsert = {
      questionnaire: {
        id: questionnaireId,
        name: questionnaireDraft.value.name,
        description: questionnaireDraft.value.description ?? "",
        origin: "import",
        listed: true,
        createdBy: opts.createdBy,
      },
      version: {
        id: versionId,
        questionnaireId,
        number: 1,
        blocks: inBlockOrder(questionnaireDraft.value.blocks) as FormBlock[],
        createdBy: opts.createdBy,
      },
      items: items.map((i) => ({ position: i.position, setVersionId, questionId: i.questionId })),
    };
    const plan: SetVersionInsert = {
      set: {
        id: setId,
        name: setDraft.value.name,
        description: setDraft.value.description ?? "",
        origin: "import",
        createdBy: opts.createdBy,
      },
      version: { id: setVersionId, setId, number: 1, createdBy: opts.createdBy },
      newQuestions,
      items,
      questionnaire,
    };
    try {
      await this.repository.insertSetVersion(plan, opts.record && ((tx) => opts.record!(tx, {
        set: { id: setId, number: 1, created: true, added: items.length, removed: 0, reworded: 0, content: plan },
        questionnaire: questionnaireSaved(questionnaire),
      })));
    } catch (err) {
      const conflict = uniqueConflict(err);
      if (conflict === "questionnaireName") {
        return { ok: false, error: `A questionnaire called ${questionnaireDraft.value.name} already exists.` };
      }
      if (conflict !== null) return { ok: false, error: `A question set called ${setDraft.value.name} already exists.` };
      throw err;
    }
    return { ok: true, setId, questionnaireId, versionId };
  }

  /** The listed questionnaires with their latest version, in library order. */
  private async listed(retired: boolean): Promise<Array<{ row: QuestionnaireLibraryRow; versionIds: string[] }>> {
    const questionnaires = (await this.repository.listQuestionnaires())
      .filter((q) => q.listed && (q.retiredAt !== null) === retired)
      .sort((a, b) => libraryOrder(a, b, DEFAULT_QUESTIONNAIRE_ID));
    let groups: SetGroup[] | null = null;
    const out: Array<{ row: QuestionnaireLibraryRow; versionIds: string[] }> = [];
    for (const q of questionnaires) {
      const versions = await this.repository.questionnaireVersionsOf(q.id);
      const latestRow = versions.at(-1);
      if (!latestRow) continue;
      const latest = toResolvedQuestionnaireVersion(latestRow);
      groups ??= await this.sets.groups();
      const rows = latest.questions.map((question, i) => ({
        rowKey: `r${i}`,
        kind: "pick" as const,
        questionId: question.questionId,
        setVersionId: question.setVersionId,
        source: question,
      }));
      out.push({
        row: {
          questionnaireId: q.id,
          name: q.name,
          description: q.description,
          origin: q.origin,
          builtin: q.origin === "builtin",
          isDefault: q.id === DEFAULT_QUESTIONNAIRE_ID,
          versionId: latestRow.id,
          version: latestRow.number,
          questionCount: latestRow.items.length,
          savedBy: latestRow.createdBy,
          savedAt: latestRow.createdAt.toISOString(),
          retiredAt: q.retiredAt ? q.retiredAt.toISOString() : null,
          updates: Object.keys(updatesAvailable(rows, groups)).length,
        },
        versionIds: versions.map((v) => v.id),
      });
    }
    return out;
  }
}

/**
 * The questionnaires of one project, on a database a door has already opened
 * (src/lib/projectDb.ts). A project's questionnaires live in its own database;
 * the builtin Annex IV default is seeded into every one by the forms migrations.
 */
export function questionnairesOn(db: PrismaClient): QuestionnaireService {
  return new QuestionnaireService(new QuestionnaireRepository(db));
}

/** The same, for code that runs after a door and knows only the project. */
export async function questionnairesFor(project: string): Promise<QuestionnaireService> {
  return questionnairesOn(await projectDbPastDoor(project));
}

/**
 * What a card of this project was filled with. NULL (a card saved before forms existed, or
 * one filled with the default) is the default version in memory, as resolve(null) says, so
 * the project's database is opened only for a real id.
 */
export async function questionnaireResolverFor(project: string): Promise<QuestionnaireResolver> {
  return {
    resolve: async (id) => (id === null ? annexDefaultVersion() : (await questionnairesFor(project)).resolve(id)),
  };
}
