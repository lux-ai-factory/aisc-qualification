"use server";

import { redirect } from "next/navigation";
import { qualificationService } from "@/server/services/QualificationService";
import { FormValidationError } from "@/server/forms/QualificationFormParser";
import { auditEvent } from "@/lib/audit";

export type SubmitState = { error?: string } | undefined;

export async function submitQualification(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  let created: { id: string };
  try {
    created = await qualificationService.createFromForm(formData);
  } catch (err) {
    if (err instanceof FormValidationError) return { error: err.message };
    throw err;
  }
  // AUDIT (server-side, before redirect): who qualified which system. `what` is server-set; the
  // forwarded Keycloak token gives the verified "who". Best-effort — never throws.
  await auditEvent({
    token: formData.get("kc_token")?.toString(),
    action: "create",
    resource_type: "qualification",
    resource_id: created.id,
    metadata: {},
  });
  redirect(`/qualifications`);
}
