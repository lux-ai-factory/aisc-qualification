// A questionnaire version and a question-set version as every reader sees them:
// names and flags, the included blocks (questionnaires only), and each question
// with its identity and the wording of the set version it is pinned to. Built by
// QuestionnaireService / QuestionSetService from the database, or in memory for
// the builtin rows (legacy.ts).
import type { AnnexPointId } from "./annexPoints";
import type { FormBlock } from "./blocks";

export type ResolvedQuestion = {
  /** question.id */
  questionId: string;
  /** "annex-1" | "f-<old form id>" | "s-<set id>" */
  scope: string;
  /** "1a" | "q3" */
  localId: string;
  /** `${scope}:${localId}` */
  key: string;
  /** `q:${scope}:${localId}` */
  field: string;
  text: string;
  /** Free text, may be "". */
  citation: string;
  required: boolean;
  annexPoint: AnnexPointId | null;
  groupLabel: string | null;
  setId: string;
  setName: string;
  /** The set version this wording is from. */
  setVersionId: string;
  setVersionNumber: number;
  setBuiltin: boolean;
};

export type ResolvedQuestionnaireVersion = {
  questionnaireId: string;
  questionnaireName: string;
  description: string;
  listed: boolean;
  builtin: boolean;
  retired: boolean;
  versionId: string;
  versionNumber: number;
  /** In FORM_BLOCKS order. */
  blocks: FormBlock[];
  /** In item position order. */
  questions: ResolvedQuestion[];
};

export type ResolvedSetVersion = {
  setId: string;
  setName: string;
  description: string;
  origin: "builtin" | "builder" | "import";
  builtin: boolean;
  retired: boolean;
  versionId: string;
  versionNumber: number;
  /** In set item position order. */
  questions: ResolvedQuestion[];
};

/** One version's stamp: who saved it, when. */
export type VersionStamp = { versionId: string; number: number; createdAt: string /* ISO 8601 */; createdBy: string };

/** Where a questionnaire version comes from: QuestionnaireService, or a fake in the tests.
 *  null for an id that names no version. */
export type QuestionnaireResolver = {
  resolve(id: string | null): Promise<ResolvedQuestionnaireVersion | null>;
};
