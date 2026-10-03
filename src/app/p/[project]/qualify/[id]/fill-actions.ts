"use server";

import { revalidatePath } from "next/cache";
import { QualificationRepository } from "@/server/repositories/QualificationRepository";
import { assertLatestCard } from "@/server/services/cardLatest";
import { projectDbForAction } from "@/lib/projectDb";
import { REFUSED } from "@/server/access/projectAccess";
import { requestFill } from "@/server/services/FillerClient";
import { currentRequestId, emitEvent } from "@/server/ledger/emit";
import { randomUUID } from "node:crypto";

export type FillActionState = { ok: true } | { ok: false; error: string };

/**
 * Run the filler again for this card: the same run a save starts.
 *
 * It replaces the filler's draft, so it takes the doors of every other change
 * to a card: write access to the project it is given (which comes from the
 * browser and is not trusted), the card in that project's database, and only
 * the latest version. Reviewer corrections are applied on top of the draft at
 * build time, so a re-run keeps them.
 */
export async function rerunFill(project: string, qualificationId: string): Promise<FillActionState> {
  try {
    const d = await projectDbForAction(project, { write: true });
    if (d.error !== undefined) return { ok: false, error: d.error };
    const repo = new QualificationRepository(d.db);
    const q = await repo.cardSummary(qualificationId);
    if (!q) return { ok: false, error: REFUSED[404] };
    await assertLatestCard(project, q.systemId);
    // The run starts in the ledger before the agent is asked, so every event of the run has a start to
    // cite: the person who asked, the card, and the run's id.
    const runId = randomUUID();
    await repo.transaction((_r, tx) =>
      emitEvent(tx, { action: "card.ai_refinement_requested", itemType: "qualification", itemId: qualificationId, runId }),
    );
    if (!(await requestFill(project, qualificationId, { runId, requestId: await currentRequestId() }))) {
      return { ok: false, error: "The card agent did not take the run: it is down or not configured here." };
    }
    revalidatePath(`/p/${project}/qualify/${qualificationId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not start the card agent." };
  }
}
