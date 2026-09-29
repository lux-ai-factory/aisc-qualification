"use server";

import { revalidatePath } from "next/cache";
import { QualificationRepository } from "@/server/repositories/QualificationRepository";
import { assertLatestCard } from "@/server/services/cardLatest";
import { projectDbForAction } from "@/lib/projectDb";
import { REFUSED } from "@/server/access/projectAccess";
import { engineClient } from "@/server/services/EngineClient";
import { partOfLink, propertyOptions } from "@/domain/cardComponents";

export type ComponentActionState = { ok: true } | { ok: false; error: string };

function failed(err: unknown, fallback: string): ComponentActionState {
  return { ok: false, error: err instanceof Error ? err.message : fallback };
}

/**
 * The card's repository, if this caller may write the project and the card is
 * in its database; throws NotLatestError unless it is the latest version's.
 *
 * The project comes from the browser, so it is not trusted: the platform is
 * asked about the caller in that project before its database is opened, and a
 * card of another project is simply not in it.
 */
async function latestCard(
  project: string,
  qualificationId: string,
): Promise<{ repo: QualificationRepository } | { error: string }> {
  const d = await projectDbForAction(project, { write: true });
  if (d.error !== undefined) return { error: d.error };
  const repo = new QualificationRepository(d.db);
  const q = await repo.cardSummary(qualificationId);
  if (!q) return { error: REFUSED[404] };
  await assertLatestCard(project, q.systemId);
  return { repo };
}

function refreshCardPage(project: string, qualificationId: string): void {
  revalidatePath(`/p/${project}/qualify/${qualificationId}`);
}

/** Link one engine component to the latest card, by an AIRO property that fits its type. */
export async function linkComponent(
  project: string,
  qualificationId: string,
  componentPid: string,
  airoProperty: string,
  /** Which of the card's components the item is (targets plan v2); none when absent. */
  componentKey: string | null = null,
): Promise<ComponentActionState> {
  try {
    const card = await latestCard(project, qualificationId);
    if ("error" in card) return { ok: false, error: card.error };
    const { repo } = card;
    const component = (await engineClient.components(project)).find((c) => c.pid === componentPid);
    if (!component) return { ok: false, error: "The engine has no such component in this project." };
    if (!propertyOptions(component.component_type).includes(airoProperty as never)) {
      return { ok: false, error: `A ${component.component_type} cannot be linked as ${airoProperty}.` };
    }
    const part = partOfLink(
      airoProperty,
      componentKey,
      new Set(componentKey ? await repo.componentKeys(qualificationId) : []),
    );
    if (!part.ok) return { ok: false, error: part.error };
    await repo.linkComponent(qualificationId, {
      componentPid,
      airoProperty,
      componentKey: part.componentKey,
      name: component.name,
      componentType: component.component_type,
      objectName: component.data ?? "",
    });
    refreshCardPage(project, qualificationId);
    return { ok: true };
  } catch (err) {
    return failed(err, "Could not link the component.");
  }
}

/** Remove the latest card's link to one engine component. */
export async function unlinkComponent(
  project: string,
  qualificationId: string,
  componentPid: string,
): Promise<ComponentActionState> {
  try {
    const card = await latestCard(project, qualificationId);
    if ("error" in card) return { ok: false, error: card.error };
    const { repo } = card;
    await repo.unlinkComponent(qualificationId, componentPid);
    refreshCardPage(project, qualificationId);
    return { ok: true };
  } catch (err) {
    return failed(err, "Could not unlink the component.");
  }
}
