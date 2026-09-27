"use server";

import {
  formImportClient,
  type FormImportResult,
} from "@/server/services/FormImportClient";

/**
 * Read a question-set file into questions for the person to review. Nothing
 * is stored: the questions go to the set editor, and only its save keeps them.
 */
export async function readQuestionSetFile(
  formData: FormData,
): Promise<FormImportResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file first." };
  }
  return formImportClient.read(file);
}
