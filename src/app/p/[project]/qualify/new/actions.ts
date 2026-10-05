"use server";

import { redirect } from "next/navigation";
import { qualificationService } from "@/server/services/QualificationService";
import { FormValidationError } from "@/server/forms/QualificationFormParser";
import { projectDbForAction } from "@/lib/projectDb";
import { emitEvent } from "@/server/ledger/emit";

export type SubmitState = { error?: string } | undefined;

const PLATFORM_SILENT = "The platform did not answer; nothing was saved";

export async function submitQualification(
  project: string,
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  // `project` is bound in the browser, so it is checked here, not only by the
  // middleware on the page the form was posted to: the platform is asked about
  // the caller in that project before its database is opened.
  const door = await projectDbForAction(project, { write: true });
  if (door.error !== undefined && door.status === 503)
    return { error: PLATFORM_SILENT };
  if (door.error !== undefined) return { error: door.error };
  let id: string;
  try {
    ({ id } = await qualificationService.createFromForm(
      project,
      formData,
      (tx, card) =>
        emitEvent(tx, {
          action: "qualification.created",
          itemType: "qualification",
          itemId: card.id,
          details: {
            questionnaire_version: card.input.questionnaireVersionId,
            risks: card.input.risks.length,
            components: (card.input.systemComponents ?? []).length,
          },
          content: card.input,
        }),
    ));
  } catch (err) {
    if (err instanceof FormValidationError) return { error: err.message };
    // The platform did not answer: no version was made, so nothing was saved.
    if (err instanceof Error && /did not answer/i.test(err.message)) {
      return { error: PLATFORM_SILENT };
    }
    // The version could not be made for another reason: say so plainly rather
    // than storing a qualification nothing else can point at.
    if (
      err instanceof Error &&
      /could not name this system|PLATFORM_URL/i.test(err.message)
    ) {
      return { error: err.message };
    }
    throw err;
  }

  // The card is built from the form alone. The filler runs only
  // when a person asks for it on the card: Refine with AI, fill-actions.ts.
  redirect(`/p/${project}/qualify/${id}`);
}
