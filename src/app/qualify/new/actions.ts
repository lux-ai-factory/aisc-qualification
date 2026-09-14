"use server";

import { redirect } from "next/navigation";
import { qualificationService } from "@/server/services/QualificationService";
import { requestFill } from "@/server/services/FillerClient";
import { FormValidationError } from "@/server/forms/QualificationFormParser";

export type SubmitState = { error?: string } | undefined;

export async function submitQualification(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  let id: string;
  try {
    ({ id } = await qualificationService.createFromForm(formData));
  } catch (err) {
    if (err instanceof FormValidationError) return { error: err.message };
    throw err;
  }

  // Ask the filler to draft the two properties that come from prose (Annex IV
  // 2(a) and 2(c)). It runs in its own service over seconds to a minute, so this
  // only starts it: the qualification is already stored, and a filler that is
  // down or absent costs nothing but an emptier first draft.
  await requestFill(id);

  redirect(`/qualify/${id}`);
}
