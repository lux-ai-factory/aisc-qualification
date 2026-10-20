// The builtin rows, in memory: questionnaire "Annex IV default" v1, KEY_QUESTIONS
// as the twin of the row the 20260925150000_two_level_forms migration makes from
// the seeded form (the builtin set "Annex IV" v1 is annexSetLiteral() in test/support). A card
// with no questionnaire version (NULL) reads through annexDefaultVersion().
// Pure: also used in the browser.
import { KEY_QUESTIONS, keyQuestionField } from "@/data/keyQuestions";
import type { AnnexPointId } from "./annexPoints";
import { FORM_BLOCKS } from "./blocks";
import type { ResolvedQuestion, ResolvedQuestionnaireVersion } from "./types";

export const ANNEX_SET_ID = "annex-iv";
export const ANNEX_SET_VERSION_ID = "annex-iv-v1";
const ANNEX_SET_NAME = "Annex IV";
export const DEFAULT_QUESTIONNAIRE_ID = "annex-iv-default";
export const DEFAULT_VERSION_ID = "annex-iv-default-v1";
const DEFAULT_QUESTIONNAIRE_NAME = "Annex IV default";
const ANNEX_DESCRIPTION =
  "EU AI Act Annex IV points 1 and 2, as 14 questions.";

/** A card's questionnaire version: NULL means the default version 1. */
export function resolveQuestionnaireVersionId(id: string | null): string {
  return id ?? DEFAULT_VERSION_ID;
}

function annexQuestions(): ResolvedQuestion[] {
  return KEY_QUESTIONS.map((q) => ({
    questionId: `annex-iv-${q.id}`,
    scope: q.group,
    localId: q.id,
    key: `${q.group}:${q.id}`,
    field: keyQuestionField(q),
    text: q.text,
    citation: q.citation,
    required: !q.optional,
    annexPoint: q.id as AnnexPointId,
    groupLabel: q.groupLabel,
    setId: ANNEX_SET_ID,
    setName: ANNEX_SET_NAME,
    setVersionId: ANNEX_SET_VERSION_ID,
    setVersionNumber: 1,
    setBuiltin: true,
  }));
}

/** A fresh value on every call, so no caller can change it for the others. */
export function annexDefaultVersion(): ResolvedQuestionnaireVersion {
  return {
    questionnaireId: DEFAULT_QUESTIONNAIRE_ID,
    questionnaireName: DEFAULT_QUESTIONNAIRE_NAME,
    description: ANNEX_DESCRIPTION,
    listed: true,
    builtin: true,
    retired: false,
    versionId: DEFAULT_VERSION_ID,
    versionNumber: 1,
    blocks: [...FORM_BLOCKS],
    questions: annexQuestions(),
  };
}
