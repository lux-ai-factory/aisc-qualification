"use server";

import { revalidatePath } from "next/cache";
import { qualificationRepository } from "@/server/repositories/QualificationRepository";
import { assertLatestCard } from "@/server/services/cardLatest";
import { engineClient } from "@/server/services/EngineClient";
import { propertyOptions } from "@/domain/cardComponents";

export type ComponentActionState = { ok: true } | { ok: false; error: string };

function failed(err: unknown, fallback: string): ComponentActionState {
  return { ok: false, error: err instanceof Error ? err.message : fallback };
}

/** The card, if it is of this project; throws NotLatestError unless it is the latest version's. */
async function latestCard(projectId: string, qualificationId: string) {
  const q = await qualificationRepository.cardSummary(projectId, qualificationId);
  if (q) await assertLatestCard(projectId, q.systemId);
  return q;
}

function refreshCardPage(projectId: string, qualificationId: string): void {
  revalidatePath(`/p/${projectId}/qualify/${qualificationId}`);
}

/** Link one engine component to the latest card, by an AIRO property that fits its type. */
export async function linkComponent(
  projectId: string,
  qualificationId: string,
  componentPid: string,
  airoProperty: string,
): Promise<ComponentActionState> {
  try {
    if (!(await latestCard(projectId, qualificationId))) {
      return { ok: false, error: "Qualification not found." };
    }
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
  projectId: string,
  qualificationId: string,
  componentPid: string,
): Promise<ComponentActionState> {
  try {
    if (!(await latestCard(projectId, qualificationId))) {
      return { ok: false, error: "Qualification not found." };
    }
    await qualificationRepository.unlinkComponent(qualificationId, componentPid);
    refreshCardPage(projectId, qualificationId);
    return { ok: true };
  } catch (err) {
    return failed(err, "Could not unlink the component.");
  }
}
