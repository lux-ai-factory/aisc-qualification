"use server";

import { projectDbForAction } from "@/lib/projectDb";
import {
  prefillClient,
  type PrefillFormSpec,
  type PrefillMode,
  type PrefillResult,
  type PrefillComponent,
  type PrefillRisk,
  type PrefillValues,
} from "@/server/services/PrefillClient";

export type PrefillState = PrefillResult | undefined;

/**
 * Read an uploaded document into the form's answers.
 *
 * Nothing is stored: the answers go back to the form, the person amends them
 * and saves as usual. The mode is what the person chose when the form already
 * had answers in it, and "empty" is the careful default.
 *
 * `project` is bound in the browser, so the platform is asked about the caller
 * in it first: a server action can be posted to any path.
 */
export async function readDocument(
  project: string,
  _prev: PrefillState,
  formData: FormData,
): Promise<PrefillState> {
  const door = await projectDbForAction(project, { write: false });
  if (door.error !== undefined) return { ok: false, error: door.error };
  const file = formData.get("document");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a document first." };
  }
  const mode = (formData.get("mode") as PrefillMode) ?? "empty";
  if (mode !== "empty" && mode !== "replace") {
    return { ok: false, error: "That is not one of the two choices." };
  }
  let current: PrefillValues = {};
  let currentRisks: PrefillRisk[] = [];
  let currentComponents: PrefillComponent[] = [];
  // Sent only for a form other than the default: which fields it has, and its questions.
  let formSpec: PrefillFormSpec | undefined;
  try {
    current = JSON.parse((formData.get("current") as string) || "{}");
    currentRisks = JSON.parse(
      (formData.get("current_risks") as string) || "[]",
    );
    currentComponents = JSON.parse(
      (formData.get("current_components") as string) || "[]",
    );
    const fields = formData.get("fields");
    const questions = formData.get("questions");
    if (typeof fields === "string" || typeof questions === "string") {
      formSpec = {
        fields: JSON.parse((fields as string) || "[]"),
        questions: JSON.parse((questions as string) || "[]"),
      };
    }
  } catch {
    return { ok: false, error: "The form's answers could not be read." };
  }
  return prefillClient.read(
    file,
    mode,
    current,
    currentRisks,
    formSpec,
    currentComponents,
  );
}
