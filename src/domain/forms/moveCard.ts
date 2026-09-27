// Moving a card to another questionnaire version (T41), and the "newer version"
// line of the card page (T42). A move makes a new card version: answers carry over
// by question (the field q:<scope>:<localId>), a question whose text changed keeps
// its answer, marked for review. Pure.
import type { ResolvedQuestionnaireVersion } from "./types";

/** field -> the text in `from`, for every question of `to` also in `from` whose text differs (exact string). */
export function rewordedSince(
  from: ResolvedQuestionnaireVersion,
  to: ResolvedQuestionnaireVersion,
): Record<string, string> {
  const before = new Map(from.questions.map((q) => [q.field, q.text]));
  const out: Record<string, string> = {};
  for (const q of to.questions) {
    const text = before.get(q.field);
    if (text !== undefined && text !== q.text) out[q.field] = text;
  }
  return out;
}

const answered = (s: string | undefined) => s !== undefined && s.trim() !== "";

/** How many non-blank answers are to questions `to` does not ask. */
export function droppedAnswers(answers: Record<string, string>, to: ResolvedQuestionnaireVersion): number {
  const fields = new Set(to.questions.map((q) => q.field));
  return Object.entries(answers).filter(([field, a]) => !fields.has(field) && answered(a)).length;
}

/** The line shown above the form while a card moves; null when it does not move. */
export function moveNotice(args: {
  from: ResolvedQuestionnaireVersion;
  to: ResolvedQuestionnaireVersion;
  cardNumber: number;
  answers: Record<string, string>;
}): string | null {
  const { from, to, answers } = args;
  if (from.versionId === to.versionId) return null;
  let notice =
    `Moving from ${from.questionnaireName} v${from.versionNumber} to ${to.questionnaireName} v${to.versionNumber}.` +
    " Answers are carried over by question.";
  const dropped = droppedAnswers(answers, to);
  if (dropped > 0) {
    notice +=
      dropped === 1
        ? " 1 answer to a question this version does not ask will not be carried over."
        : ` ${dropped} answers to questions this version does not ask will not be carried over.`;
  }
  const reworded = Object.keys(rewordedSince(from, to)).filter((field) => answered(answers[field])).length;
  if (reworded > 0) {
    notice +=
      reworded === 1
        ? " 1 reworded question is marked for review."
        : ` ${reworded} reworded questions are marked for review.`;
  }
  return notice;
}

/**
 * The latest version of the card's questionnaire, when it is listed, not retired
 * and numbered higher than the card's; else null (D27).
 */
export function newerVersion(
  card: ResolvedQuestionnaireVersion,
  latest: ResolvedQuestionnaireVersion | null,
): { versionId: string; versionNumber: number } | null {
  if (!latest || latest.questionnaireId !== card.questionnaireId) return null;
  if (!latest.listed || latest.retired || latest.versionNumber <= card.versionNumber) return null;
  return { versionId: latest.versionId, versionNumber: latest.versionNumber };
}
