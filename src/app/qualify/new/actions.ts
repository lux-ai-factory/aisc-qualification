"use server";

import { redirect } from "next/navigation";
import { qualificationService } from "@/server/services/QualificationService";
import { FormValidationError } from "@/server/forms/QualificationFormParser";

export type SubmitState = { error?: string } | undefined;

export async function submitQualification(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  try {
    await qualificationService.createFromForm(formData);
  } catch (err) {
    if (err instanceof FormValidationError) return { error: err.message };
    throw err;
  }
  redirect(`/qualifications`);
}
