"use server";

import { redirect } from "next/navigation";
import { callerName } from "@/server/access/callerName";
import { projectDbForAction } from "@/lib/projectDb";
import { questionnairesOn } from "@/server/services/QuestionnaireService";
import { platformClient } from "@/server/services/PlatformClient";
import { parseQuestionnaireDraft, type QuestionnaireDraft } from "@/domain/forms/questionnaireDraft";
import type { FormsRecorder } from "@/server/services/QuestionSetService";
import { emitEvent } from "@/server/ledger/emit";

/** The ledger's event for a questionnaire save, in its transaction (ledger phase 5). */
const recordQuestionnaire: FormsRecorder = async (tx, saved) => {
  const q = saved.questionnaire;
  if (!q) return;
  if (q.created) {
    await emitEvent(tx, { action: "questionnaire.created", itemType: "questionnaire", itemId: q.id,
      details: { version: q.number }, content: q.content });
  } else {
    await emitEvent(tx, { action: "questionnaire.version_created", itemType: "questionnaire", itemId: q.id,
      itemVersion: q.number, details: { version: q.number, items: q.items, blocks: q.blocks }, content: q.content });
  }
};

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
    record: recordQuestionnaire,
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
    record: recordQuestionnaire,
  });
  if (!saved.ok) return { error: saved.error };
  redirect(`/p/${project}/system/edit?questionnaireVersion=${encodeURIComponent(saved.versionId)}`);
}

/** Retire a questionnaire: hidden from the chooser, still resolvable (T35). */
export async function retireQuestionnaire(project: string, questionnaireId: string): Promise<{ error?: string }> {
  const door = await projectDbForAction(project, { write: true });
  if (door.error !== undefined) return { error: door.error };
  const result = await questionnairesOn(door.db).retire(questionnaireId, (tx) =>
    emitEvent(tx, { action: "questionnaire.retired", itemType: "questionnaire", itemId: questionnaireId }),
  );
  if (!result.ok) return { error: result.error };
  redirect(`/p/${project}/questionnaires`);
}
