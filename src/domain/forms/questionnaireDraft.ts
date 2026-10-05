// The questionnaire builder's save payload, validated on the server before
// anything is written. A questionnaire never words a question: an item is
// only the question and the set version whose wording it shows. zod checks the
// shape; the plain checks after it give the messages a person reads, in a fixed
// order, naming the 1-based item position.
import { z } from "zod";
import { isFormBlock, type FormBlock } from "./blocks";
import type { ResolvedQuestionnaireVersion } from "./types";

export type QuestionnaireDraftItem = {
  setVersionId: string;
  questionId: string;
};

export type QuestionnaireDraft = {
  /** 1..120 after trim; ignored when saving a new version of an existing questionnaire. */
  name: string;
  /** 0..500 */
  description?: string;
  /** Any subset of FORM_BLOCKS, no duplicates. */
  blocks: FormBlock[];
  /** 0..200 items, order = position; one per question. */
  items: QuestionnaireDraftItem[];
};

export const MAX_NAME = 120;
export const MAX_DESCRIPTION = 500;
export const MAX_ITEMS = 200;

// Non-strict objects: an extra key (an item sent with its wording) is dropped, never read.
const draftShape = z.object({
  name: z.string(),
  description: z.string().optional(),
  blocks: z.array(z.string()),
  items: z.array(
    z.object({ setVersionId: z.string(), questionId: z.string() }),
  ),
});

export type ParsedQuestionnaireDraft =
  | { ok: true; value: QuestionnaireDraft }
  | { ok: false; error: string };

/** Never throws. `takenNames`, when given, are the names of the other listed, active questionnaires. */
export function parseQuestionnaireDraft(
  input: unknown,
  context?: { takenNames?: string[] },
): ParsedQuestionnaireDraft {
  const shape = draftShape.safeParse(input);
  if (!shape.success)
    return { ok: false, error: "The questionnaire could not be read." };
  const draft = shape.data;

  const name = draft.name.trim();
  if (name === "")
    return { ok: false, error: "Give the questionnaire a name." };
  if (name.length > MAX_NAME) {
    return {
      ok: false,
      error: `A questionnaire name is at most ${MAX_NAME} characters.`,
    };
  }
  const taken = context?.takenNames?.some(
    (t) => t.trim().toLowerCase() === name.toLowerCase(),
  );
  if (taken)
    return {
      ok: false,
      error: `A questionnaire called ${name} already exists.`,
    };

  const description = (draft.description ?? "").trim();
  if (description.length > MAX_DESCRIPTION) {
    return {
      ok: false,
      error: `A description is at most ${MAX_DESCRIPTION} characters.`,
    };
  }

  const blocks: FormBlock[] = [];
  for (const b of draft.blocks) {
    if (!isFormBlock(b))
      return { ok: false, error: `${b} is not a part of the questionnaire.` };
    if (blocks.includes(b))
      return { ok: false, error: `${b} is in the questionnaire twice.` };
    blocks.push(b);
  }

  if (draft.items.length > MAX_ITEMS) {
    return {
      ok: false,
      error: `A questionnaire has at most ${MAX_ITEMS} questions.`,
    };
  }

  const seen = new Set<string>();
  const items: QuestionnaireDraftItem[] = [];
  for (const [i, it] of draft.items.entries()) {
    if (seen.has(it.questionId))
      return {
        ok: false,
        error: `Question ${i + 1} is already in the questionnaire.`,
      };
    seen.add(it.questionId);
    items.push({ setVersionId: it.setVersionId, questionId: it.questionId });
  }

  return { ok: true, value: { name, description, blocks, items } };
}

/**
 * Whether saving `draft` over `version` would change nothing. The name and
 * description are not content; blocks compare as sets; items compare as the
 * (setVersionId, questionId) pairs in order, so a question pinned to another set
 * version is a change.
 */
export function sameQuestionnaireContent(
  draft: QuestionnaireDraft,
  version: ResolvedQuestionnaireVersion,
): boolean {
  const a = new Set<string>(draft.blocks);
  const b = new Set<string>(version.blocks);
  if (a.size !== b.size || [...a].some((x) => !b.has(x))) return false;
  if (draft.items.length !== version.questions.length) return false;
  return draft.items.every(
    (d, i) =>
      d.questionId === version.questions[i].questionId &&
      d.setVersionId === version.questions[i].setVersionId,
  );
}
