// The question-set editor's save payload, validated on the server before anything
// is written. zod checks the shape; the plain checks after it give the messages a
// person reads, in a fixed order, naming the 1-based question position.
import { z } from "zod";
import { isAnnexPoint, type AnnexPointId } from "./annexPoints";
import type { ResolvedSetVersion } from "./types";

export type SetDraftQuestion = {
  /** The question this row words again; absent for a new question. */
  questionId?: string;
  text: string;
  citation: string;
  required: boolean;
  annexPoint: AnnexPointId | null;
};

export type SetDraft = {
  /** 1..120 after trim; fixed once the set exists. */
  name: string;
  /** 0..500; fixed once the set exists. */
  description?: string;
  /** 1..200 entries, order = position. */
  questions: SetDraftQuestion[];
};

export const MAX_NAME = 120;
export const MAX_DESCRIPTION = 500;
export const MAX_QUESTIONS = 200;
export const MAX_TEXT = 2000;
export const MAX_CITATION = 200;

// Non-strict objects: an extra key is dropped, not refused.
const draftShape = z.object({
  name: z.string(),
  description: z.string().optional(),
  questions: z.array(
    z.object({
      questionId: z.string().optional(),
      text: z.string(),
      citation: z.string(),
      required: z.boolean(),
      annexPoint: z.string().nullable(),
    }),
  ),
});

export type ParsedSetDraft = { ok: true; value: SetDraft } | { ok: false; error: string };

/** Never throws. `takenNames`, when given, are the names of the other active sets. */
export function parseSetDraft(input: unknown, context?: { takenNames?: string[] }): ParsedSetDraft {
  const shape = draftShape.safeParse(input);
  if (!shape.success) return { ok: false, error: "The question set could not be read." };
  const draft = shape.data;

  const name = draft.name.trim();
  if (name === "") return { ok: false, error: "Give the question set a name." };
  if (name.length > MAX_NAME) {
    return { ok: false, error: `A question set name is at most ${MAX_NAME} characters.` };
  }
  const taken = context?.takenNames?.some((t) => t.trim().toLowerCase() === name.toLowerCase());
  if (taken) return { ok: false, error: `A question set called ${name} already exists.` };

  const description = (draft.description ?? "").trim();
  if (description.length > MAX_DESCRIPTION) {
    return { ok: false, error: `A description is at most ${MAX_DESCRIPTION} characters.` };
  }

  if (draft.questions.length === 0) return { ok: false, error: "A question set needs at least one question." };
  if (draft.questions.length > MAX_QUESTIONS) {
    return { ok: false, error: `A question set has at most ${MAX_QUESTIONS} questions.` };
  }

  const seen = new Set<string>();
  const questions: SetDraftQuestion[] = [];
  for (const [i, q] of draft.questions.entries()) {
    const n = i + 1;
    const text = q.text.trim();
    const citation = q.citation.trim();
    if (text === "") return { ok: false, error: `Question ${n} has no text.` };
    if (text.length > MAX_TEXT) {
      return { ok: false, error: `Question ${n} is longer than ${MAX_TEXT} characters.` };
    }
    if (citation.length > MAX_CITATION) {
      return { ok: false, error: `The citation of question ${n} is longer than ${MAX_CITATION} characters.` };
    }
    if (q.annexPoint !== null && !isAnnexPoint(q.annexPoint)) {
      return { ok: false, error: `Question ${n} names an Annex IV point that does not exist.` };
    }
    if (q.questionId !== undefined) {
      if (seen.has(q.questionId)) return { ok: false, error: `Question ${n} is already in the question set.` };
      seen.add(q.questionId);
    }
    const wording = { text, citation, required: q.required, annexPoint: q.annexPoint as AnnexPointId | null };
    questions.push(q.questionId === undefined ? wording : { questionId: q.questionId, ...wording });
  }

  return { ok: true, value: { name, description, questions } };
}

/**
 * Whether saving `draft` as the next version of the set whose latest version is
 * `latest` would change nothing. Name, description and group labels are not
 * content; a row without a questionId is a new question, so always a change.
 */
export function sameSetContent(draft: SetDraft, latest: ResolvedSetVersion): boolean {
  if (draft.questions.length !== latest.questions.length) return false;
  return draft.questions.every((d, i) => {
    const v = latest.questions[i];
    return (
      d.questionId !== undefined &&
      d.questionId === v.questionId &&
      d.text === v.text &&
      d.citation === v.citation &&
      d.required === v.required &&
      d.annexPoint === v.annexPoint
    );
  });
}
