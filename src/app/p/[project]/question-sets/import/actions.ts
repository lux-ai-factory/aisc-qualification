"use server";

import { projectDbForAction } from "@/lib/projectDb";
import {
  formImportClient,
  type FormImportResult,
} from "@/server/services/FormImportClient";

/**
 * Read a question-set file into questions for the person to review. Nothing
 * is stored: the questions go to the set editor, and only its save keeps them.
 * The platform is asked about the caller in `project` first, as for a
 * questionnaire file: a server action can be posted to any path.
 */
export async function readQuestionSetFile(
  project: string,
  formData: FormData,
): Promise<FormImportResult> {
  const door = await projectDbForAction(project, { write: false });
  if (door.error !== undefined) return { ok: false, error: door.error };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file first." };
  }
  return formImportClient.read(file);
}
