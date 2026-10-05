// Test support for the form tests: question sets, where questions are written, and
// questionnaires, what a card is filled with.
//
// Literal builders for ResolvedQuestion / ResolvedQuestionnaireVersion / ResolvedSetVersion,
// so a test can describe a questionnaire without the modules under test. Only types are
// imported from src/domain/forms, and `import type` is erased at run time, so this file loads
// even when those modules fail to.
//
// `formVersion` is the name of the questionnaire version builder (`questionnaireVersion` is the
// same builder under its other name).
import type {
  ResolvedQuestion,
  ResolvedQuestionnaireVersion,
  ResolvedSetVersion,
} from "@/domain/forms/types";
import { KEY_QUESTIONS } from "@/data/keyQuestions";

/** The 9 removable blocks, in FORM_BLOCKS order. */
export const ALL_BLOCKS = [
  "description",
  "targetUseCase",
  "targetUsers",
  "intendedDeployers",
  "targetSystemTags",
  "sectorTags",
  "marketFormTags",
  "localityTags",
  "risks",
] as const;

/** The builtin set's description (migration 20260925090000, carried by the two-level migration). */
export const ANNEX_DESCRIPTION =
  "EU AI Act Annex IV points 1 and 2, as 14 questions.";

/**
 * One custom question of set `setId`, keyed f-<setId>:<localId>: the scope of a question made
 * before two-level forms (a migrated form's own question keeps it). Its set has the form's id.
 * Wording from set version `<setId>-v1` unless overridden.
 */
export function customQuestion(
  setId: string,
  localId: string,
  over: Partial<ResolvedQuestion> = {},
): ResolvedQuestion {
  const scope = `f-${setId}`;
  return {
    questionId: `${setId}-${localId}`,
    scope,
    localId,
    key: `${scope}:${localId}`,
    field: `q:${scope}:${localId}`,
    text: `Question ${localId} of ${setId}?`,
    citation: "",
    required: true,
    annexPoint: null,
    groupLabel: null,
    setId,
    setName: "Acme AI policy",
    setVersionId: `${setId}-v1`,
    setVersionNumber: 1,
    setBuiltin: false,
    ...over,
  } as ResolvedQuestion;
}

/**
 * One question written in set `setId` after two-level forms: keyed s-<setId>:<localId>.
 * Wording from set version `<setId>-v1` unless overridden.
 */
export function setQuestion(
  setId: string,
  localId: string,
  over: Partial<ResolvedQuestion> = {},
): ResolvedQuestion {
  const scope = `s-${setId}`;
  return customQuestion(setId, localId, {
    key: `${scope}:${localId}`,
    field: `q:${scope}:${localId}`,
    ...over,
    scope,
  } as Partial<ResolvedQuestion>);
}

/** One of the 14 builtin questions, as set "Annex IV" v1 words it. */
export function seededQuestion(id: string): ResolvedQuestion {
  const k = KEY_QUESTIONS.find((q) => q.id === id);
  if (!k) throw new Error(`no key question ${id}`);
  return {
    questionId: `annex-iv-${k.id}`,
    scope: k.group,
    localId: k.id,
    key: `${k.group}:${k.id}`,
    field: `q:${k.group}:${k.id}`,
    text: k.text,
    citation: k.citation,
    required: !k.optional,
    annexPoint: k.id,
    groupLabel: k.groupLabel,
    setId: "annex-iv",
    setName: "Annex IV",
    setVersionId: "annex-iv-v1",
    setVersionNumber: 1,
    setBuiltin: true,
  } as ResolvedQuestion;
}

/**
 * A resolved questionnaire version. Defaults: a listed builder questionnaire "Acme AI policy"
 * with no blocks and no questions.
 */
export function formVersion(
  over: Partial<ResolvedQuestionnaireVersion> = {},
): ResolvedQuestionnaireVersion {
  return {
    questionnaireId: "acme",
    questionnaireName: "Acme AI policy",
    description: "",
    listed: true,
    builtin: false,
    retired: false,
    versionId: "acme-v1",
    versionNumber: 1,
    blocks: [],
    questions: [],
    ...over,
  } as ResolvedQuestionnaireVersion;
}

/** The same builder under the questionnaire name. */
export const questionnaireVersion = formVersion;

/** A resolved set version. Defaults: set "Acme AI policy" (acme) v1, builder, no questions. */
export function setVersion(
  over: Partial<ResolvedSetVersion> = {},
): ResolvedSetVersion {
  return {
    setId: "acme",
    setName: "Acme AI policy",
    description: "",
    origin: "builder",
    builtin: false,
    retired: false,
    versionId: "acme-v1",
    versionNumber: 1,
    questions: [],
    ...over,
  } as ResolvedSetVersion;
}

/** The default questionnaire version as a literal, built from KEY_QUESTIONS the way the seed is. */
export function defaultVersionLiteral(): ResolvedQuestionnaireVersion {
  return formVersion({
    questionnaireId: "annex-iv-default",
    questionnaireName: "Annex IV default",
    description: ANNEX_DESCRIPTION,
    listed: true,
    builtin: true,
    retired: false,
    versionId: "annex-iv-default-v1",
    versionNumber: 1,
    blocks: [...ALL_BLOCKS] as never,
    questions: KEY_QUESTIONS.map((k) => seededQuestion(k.id)),
  });
}

/** The builtin set "Annex IV" v1 as a literal. */
export function annexSetLiteral(): ResolvedSetVersion {
  return setVersion({
    setId: "annex-iv",
    setName: "Annex IV",
    description: ANNEX_DESCRIPTION,
    origin: "builtin",
    builtin: true,
    retired: false,
    versionId: "annex-iv-v1",
    versionNumber: 1,
    questions: KEY_QUESTIONS.map((k) => seededQuestion(k.id)),
  });
}

/** A policy-only questionnaire: 18 Acme questions, 3 tagged 1a, 2a, 2g, no blocks. */
export function policyOnlyVersion(): ResolvedQuestionnaireVersion {
  const tags: Record<number, string> = { 1: "1a", 5: "2a", 9: "2g" };
  return formVersion({
    questions: Array.from({ length: 18 }, (_, i) =>
      customQuestion("acme", `q${i + 1}`, {
        text: `Acme question ${i + 1}?`,
        citation: `Acme AI Policy §${i + 1}`,
        annexPoint: (tags[i + 1] ?? null) as never,
      }),
    ),
  });
}

/**
 * Load a module at run time. A static import of a module that is missing or
 * fails to load fails the whole file; this fails only the tests that need it,
 * with the reason in the message.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadSrc(path: string): Promise<any> {
  const { resolve } = await import("node:path");
  return import(/* @vite-ignore */ resolve("src", path));
}
