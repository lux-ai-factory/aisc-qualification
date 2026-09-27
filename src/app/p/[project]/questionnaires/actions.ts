"use server";

import { redirect } from "next/navigation";
import { callerName } from "@/server/access/callerName";
import { projectDbForAction } from "@/lib/projectDb";
import { questionnairesOn } from "@/server/services/QuestionnaireService";
import { platformClient } from "@/server/services/PlatformClient";
import { parseQuestionnaireDraft, type QuestionnaireDraft } from "@/domain/forms/questionnaireDraft";

type Origin = "builder" | "import";

/** The builder's draft, read and checked; QuestionnaireService checks it again. */
function readDraft(
  draftJson: string,
  name?: string,
): { ok: true; value: QuestionnaireDraft } | { ok: false; error: string } {
  let input: unknown;
  try {
    input = JSON.parse(draftJson);
  } catch {
    return { ok: false, error: "The questionnaire could not be read." };
  }
  if (name !== undefined && input && typeof input === "object") input = { ...input, name };
  return parseQuestionnaireDraft(input);
}

/**
 * Save the builder's questionnaire: a new listed one, or the next version of
 * `questionnaireId` (T30). Then open the card form on it.
 */
export async function saveQuestionnaire(
  project: string,
  draftJson: string,
  questionnaireId?: string,
  origin?: Origin,
): Promise<{ error?: string }> {
  const door = await projectDbForAction(project, { write: true });
  if (door.error !== undefined) return { error: door.error };
  const draft = readDraft(draftJson);
  if (!draft.ok) return { error: draft.error };
  const saved = await questionnairesOn(door.db).saveDraft(draft.value, {
    questionnaireId,
    listed: true,
    origin: origin ?? "builder",
    createdBy: await callerName(),
  });
  if (!saved.ok) return { error: saved.error };
  redirect(`/p/${project}/system/edit?questionnaire=${encodeURIComponent(saved.questionnaireId)}`);
}

/**
 * Fill the card form with these picks once, without adding a questionnaire to
 * the list: an unlisted questionnaire the service names after the system (the
 * project's latest card name, else the project) and today. The draft's own
 * name is ignored.
 */
export async function useQuestionnaireOnce(
  project: string,
  draftJson: string,
  origin?: Origin,
): Promise<{ error?: string }> {
  const door = await projectDbForAction(project, { write: true });
  if (door.error !== undefined) return { error: door.error };
  const draft = readDraft(draftJson, "Custom questions");
  if (!draft.ok) return { error: draft.error };
  const latest = await platformClient.latestVersion(project).catch(() => null);
  const saved = await questionnairesOn(door.db).saveDraft(draft.value, {
    listed: false,
    origin: origin ?? "builder",
    createdBy: await callerName(),
    systemName: latest?.name ?? project,
  });
  if (!saved.ok) return { error: saved.error };
  redirect(`/p/${project}/system/edit?questionnaireVersion=${encodeURIComponent(saved.versionId)}`);
}

/** Retire a questionnaire: hidden from the chooser, still resolvable (T35). */
export async function retireQuestionnaire(project: string, questionnaireId: string): Promise<{ error?: string }> {
  const door = await projectDbForAction(project, { write: true });
  if (door.error !== undefined) return { error: door.error };
  const result = await questionnairesOn(door.db).retire(questionnaireId);
  if (!result.ok) return { error: result.error };
  redirect(`/p/${project}/questionnaires`);
}
