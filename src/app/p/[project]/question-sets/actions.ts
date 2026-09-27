"use server";

import { redirect } from "next/navigation";
import { callerName } from "@/server/access/callerName";
import { projectDbForAction } from "@/lib/projectDb";
import { questionSetsOn } from "@/server/services/QuestionSetService";
import { parseSetDraft } from "@/domain/forms/questionSetDraft";

export type QuestionSetActionState = { error?: string };

type SaveOptions = { origin?: "builder" | "import"; alsoQuestionnaire?: boolean };

/**
 * Save the set editor's draft: a new question set, or the next version of
 * `setId`. Then open the set's page on the version saved (T18). The set is the
 * project's own, in its database: an editor of that project may save it.
 */
export async function saveQuestionSet(
  project: string,
  draftJson: string,
  setId?: string,
  opts: SaveOptions = {},
): Promise<QuestionSetActionState> {
  const door = await projectDbForAction(project, { write: true });
  if (door.error !== undefined) return { error: door.error };
  let input: unknown;
  try {
    input = JSON.parse(draftJson);
  } catch {
    return { error: "The question set could not be read." };
  }
  const draft = parseSetDraft(input);
  if (!draft.ok) return { error: draft.error };
  const saved = await questionSetsOn(door.db).saveDraft(draft.value, {
    setId,
    origin: opts.origin ?? "builder",
    createdBy: await callerName(),
    alsoQuestionnaire: opts.alsoQuestionnaire ?? false,
  });
  if (!saved.ok) return { error: saved.error };
  const unchanged = saved.created ? "" : "&unchanged=1";
  redirect(`/p/${project}/question-sets/${encodeURIComponent(saved.setId)}?version=${saved.number}${unchanged}`);
}

/** Retire a question set: hidden from pickers, still resolvable (T18, T19). */
export async function retireQuestionSet(project: string, setId: string): Promise<QuestionSetActionState> {
  const door = await projectDbForAction(project, { write: true });
  if (door.error !== undefined) return { error: door.error };
  const result = await questionSetsOn(door.db).retire(setId);
  if (!result.ok) return { error: result.error };
  redirect(`/p/${project}/question-sets`);
}
