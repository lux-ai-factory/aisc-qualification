"use server";

import { revalidatePath } from "next/cache";
import { qualificationRepository } from "@/server/repositories/QualificationRepository";
import { assertLatestCard } from "@/server/services/cardLatest";
import { qualificationForWriter } from "@/server/access/qualificationAccess";
import { REFUSED } from "@/server/access/projectAccess";
import { engineClient } from "@/server/services/EngineClient";
import { propertyOptions } from "@/domain/cardComponents";

export type ComponentActionState = { ok: true } | { ok: false; error: string };

function failed(err: unknown, fallback: string): ComponentActionState {
  return { ok: false, error: err instanceof Error ? err.message : fallback };
}

/**
 * The card and its own project, if this caller may write it; throws
 * NotLatestError unless it is the latest version's.
 *
 * The project is read from the qualification. The browser sends one too
 * (`_clientProject` below), and it is ignored: the middleware checked the
 * project in the URL the action was posted to, which need not be the card's.
 */
async function latestCard(
  qualificationId: string,
): Promise<{ projectId: string } | { error: string }> {
  const write = await qualificationForWriter(qualificationId);
  if (!write.ok) return { error: REFUSED[write.status] };
  const q = await qualificationRepository.cardSummary(write.project, qualificationId);
  if (!q) return { error: REFUSED[404] };
  await assertLatestCard(write.project, q.systemId);
  return { projectId: write.project };
}

function refreshCardPage(projectId: string, qualificationId: string): void {
  revalidatePath(`/p/${projectId}/qualify/${qualificationId}`);
}

/** Link one engine component to the latest card, by an AIRO property that fits its type. */
export async function linkComponent(
  _clientProject: string,
  qualificationId: string,
  componentPid: string,
  airoProperty: string,
): Promise<ComponentActionState> {
  try {
    const card = await latestCard(qualificationId);
    if ("error" in card) return { ok: false, error: card.error };
    const { projectId } = card;
    const component = (await engineClient.components(projectId)).find((c) => c.pid === componentPid);
    if (!component) return { ok: false, error: "The engine has no such component in this project." };
    if (!propertyOptions(component.component_type).includes(airoProperty as never)) {
      return { ok: false, error: `A ${component.component_type} cannot be linked as ${airoProperty}.` };
    }
    await qualificationRepository.linkComponent(qualificationId, {
      componentPid,
      airoProperty,
      name: component.name,
      componentType: component.component_type,
      objectName: component.data ?? "",
    });
    refreshCardPage(projectId, qualificationId);
    return { ok: true };
  } catch (err) {
    return failed(err, "Could not link the component.");
  }
}

/** Remove the latest card's link to one engine component. */
export async function unlinkComponent(
  _clientProject: string,
  qualificationId: string,
  componentPid: string,
): Promise<ComponentActionState> {
  try {
    const card = await latestCard(qualificationId);
    if ("error" in card) return { ok: false, error: card.error };
    const { projectId } = card;
    await qualificationRepository.unlinkComponent(qualificationId, componentPid);
    refreshCardPage(projectId, qualificationId);
    return { ok: true };
  } catch (err) {
    return failed(err, "Could not unlink the component.");
  }
}
