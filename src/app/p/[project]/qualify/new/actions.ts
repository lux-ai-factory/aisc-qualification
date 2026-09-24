"use server";

import { redirect } from "next/navigation";
import { qualificationService } from "@/server/services/QualificationService";
import { requestFill } from "@/server/services/FillerClient";
import { FormValidationError } from "@/server/forms/QualificationFormParser";

export type SubmitState = { error?: string } | undefined;

export async function submitQualification(
  project: string,
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  let made: { id: string; projectId: string };
  try {
    made = await qualificationService.createFromForm(project, formData);
  } catch (err) {
    if (err instanceof FormValidationError) return { error: err.message };
    // The platform did not answer: no version was made, so nothing was saved.
    if (err instanceof Error && /did not answer/i.test(err.message)) {
      return { error: "The platform did not answer; nothing was saved" };
    }
    // The version could not be made for another reason: say so plainly rather
    // than storing a qualification nothing else can point at.
    if (err instanceof Error && /could not name this system|PLATFORM_URL/i.test(err.message)) {
      return { error: err.message };
    }
    throw err;
  }

  // Ask the filler to draft the two properties that come from prose (Annex IV
  // 2(a) and 2(c)). It runs in its own service over seconds to a minute, so this
  // only starts it: the qualification is already stored, and a filler that is
  // down or absent costs nothing but an emptier first draft. It is asked for
  // this project, so it uses the model the project chose.
  await requestFill(made.id, made.projectId);

  redirect(`/p/${project}/qualify/${made.id}`);
}
