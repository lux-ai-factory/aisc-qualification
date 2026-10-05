"use server";

import { revalidatePath } from "next/cache";
import { ontologyService } from "@/server/services/OntologyService";
import { projectDbForAction } from "@/lib/projectDb";
import { REFUSED } from "@/server/access/projectAccess";
import { QualificationRepository } from "@/server/repositories/QualificationRepository";
import type { NodePatch, OntologyView } from "@/domain/OntologyView";
import { emitEvent } from "@/server/ledger/emit";

// A discriminated union on `ok`, so a truthiness check narrows in the client.
export type OntologyState =
  | { ok: true; view: OntologyView; problems: string[] }
  | { ok: false; error: string };

// Every action here acts on the card in the database of the project it is
// given. That project comes from the browser, so it is not trusted: the
// platform is asked about the caller in THAT project before its database is
// opened, and a card of another project is not in it.

/** The card, if it is in this project's database and the caller may (read or) write it. */
async function cardIn(
  project: string,
  qualificationId: string,
  write: boolean,
): Promise<{ error: string } | null> {
  const d = await projectDbForAction(project, { write });
  if (d.error !== undefined) return { error: d.error };
  const card = await new QualificationRepository(d.db).cardSummary(
    qualificationId,
  );
  return card ? null : { error: REFUSED[404] };
}

/** Build (or rebuild) the filled graph for the card. */
export async function loadOntology(
  project: string,
  qualificationId: string,
): Promise<OntologyState> {
  try {
    const refused = await cardIn(project, qualificationId, false);
    if (refused) return { ok: false, ...refused };
    const built = await ontologyService.build(project, qualificationId);
    return { ok: true, view: built.view, problems: built.problems };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Ontology build failed.",
    };
  }
}

/** Record one reviewer correction to one node, then rebuild. */
export async function patchOntologyNode(
  project: string,
  qualificationId: string,
  nodeId: string,
  change: NodePatch,
): Promise<OntologyState> {
  try {
    const refused = await cardIn(project, qualificationId, true);
    if (refused) return { ok: false, ...refused };
    const built = await ontologyService.patchNode(
      project,
      qualificationId,
      nodeId,
      change,
      (tx, c) =>
        emitEvent(tx, {
          action: "card.node_corrected",
          itemType: "qualification",
          itemId: qualificationId,
          details: { node: c.node },
          // This node's states go in content: before/after describe the whole item.
          content: { change, before: c.before, after: c.after },
        }),
    );
    revalidatePath(`/p/${project}/qualify/${qualificationId}`);
    return { ok: true, view: built.view, problems: built.problems };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not save the change.",
    };
  }
}

/** Discard every correction and return to the generated graph. */
export async function resetOntology(
  project: string,
  qualificationId: string,
): Promise<OntologyState> {
  try {
    const refused = await cardIn(project, qualificationId, true);
    if (refused) return { ok: false, ...refused };
    const built = await ontologyService.resetPatch(
      project,
      qualificationId,
      (tx, c) =>
        emitEvent(tx, {
          action: "card.corrections_discarded",
          itemType: "qualification",
          itemId: qualificationId,
          content: { before: c.before, after: {} },
        }),
    );
    revalidatePath(`/p/${project}/qualify/${qualificationId}`);
    return { ok: true, view: built.view, problems: built.problems };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not reset.",
    };
  }
}
