"use server";

import { revalidatePath } from "next/cache";
import { ontologyService } from "@/server/services/OntologyService";
import type { NodePatch, OntologyView } from "@/domain/OntologyView";

// A discriminated union on `ok`, so a truthiness check narrows in the client.
export type OntologyState =
  | { ok: true; view: OntologyView; problems: string[] }
  | { ok: false; error: string };

/** Build (or rebuild) the filled graph for the card. */
export async function loadOntology(
  qualificationId: string,
): Promise<OntologyState> {
  try {
    const built = await ontologyService.build(qualificationId);
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
  qualificationId: string,
  nodeId: string,
  change: NodePatch,
): Promise<OntologyState> {
  try {
    const built = await ontologyService.patchNode(
      qualificationId,
      nodeId,
      change,
    );
    revalidatePath(`/qualify/${qualificationId}`);
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
  qualificationId: string,
): Promise<OntologyState> {
  try {
    const built = await ontologyService.resetPatch(qualificationId);
    revalidatePath(`/qualify/${qualificationId}`);
    return { ok: true, view: built.view, problems: built.problems };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not reset.",
    };
  }
}
