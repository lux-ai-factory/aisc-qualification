"use server";

import { redirect } from "next/navigation";
import { CardNotSaved, qualificationService } from "@/server/services/QualificationService";
import { FormValidationError } from "@/server/forms/QualificationFormParser";
import { projectDbForAction } from "@/lib/projectDb";
import { emitEvent } from "@/vendor/aisc-ledger/emit";

export type SubmitState = { error?: string } | undefined;

const PLATFORM_SILENT = "The platform did not answer, so the card was not saved.";

/** What the person is told of a card that was not saved, by what became of the card version made for it. */
const NOT_SAVED: Record<CardNotSaved["version"], string> = {
  withdrawn: "The card was not saved. The card version made for it was withdrawn.",
  none: "The card was not saved, and no card version was made.",
  unknown:
    "The card was not saved. The platform may hold an empty card version; it could not be withdrawn, so ask an admin to check the card versions.",
};

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
  const change = formData.get("change");
  if (change !== "system" && change !== "correction") {
    return {
      error:
        "Choose whether the system changed or you are correcting its description.",
    };
  }
  let id: string;
  try {
    if (change === "correction") {
      const text = (name: string) => String(formData.get(name) ?? "").trim();
      const reason = text("amendReason");
      const requestedBy = text("amendRequestedBy");
      ({ id } = await qualificationService.reviseFromForm(
        project,
        formData,
        { reason, requestedBy },
        (tx, card) =>
          emitEvent(tx, {
            action: "qualification.amended",
            itemType: "qualification",
            itemId: card.id,
            details: {
              revision: card.revision,
              amends: card.amendsId,
              reason,
              requested_by: requestedBy,
              risks: card.input.risks.length,
              components: (card.input.systemComponents ?? []).length,
            },
            content: card.input,
          }),
      ));
    } else {
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
              // a next version: what it took from the review of the card before it
              ...(card.review && {
                review_from_version: card.review.from_version,
                corrections_carried: card.review.carried.length,
                corrections_left: card.review.left.length,
                draft: card.review.draft,
                review_failed: card.review.failed !== undefined,
              }),
            },
            content: card.review ? { ...card.input, review: card.review } : card.input,
          }),
      ));
    }
  } catch (err) {
    if (err instanceof FormValidationError) return { error: err.message };
    if (err instanceof CardNotSaved) return { error: NOT_SAVED[err.version] };
    // A correction the platform did not count in time: the card's transaction was rolled back with it.
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
