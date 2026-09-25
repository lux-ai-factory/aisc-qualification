"use server";

import { revalidatePath } from "next/cache";
import { ontologyService } from "@/server/services/OntologyService";
import { qualificationForCaller, qualificationForWriter } from "@/server/access/qualificationAccess";
import { REFUSED } from "@/server/access/projectAccess";
import type { NodePatch, OntologyView } from "@/domain/OntologyView";

// A discriminated union on `ok`, so a truthiness check narrows in the client.
export type OntologyState =
  | { ok: true; view: OntologyView; problems: string[] }
  | { ok: false; error: string };

// Every action here takes the project from the qualification it acts on. The
// browser sends one too (`_clientProject`), and it is ignored: the middleware
// checked the project in the URL the action was posted to, which need not be
// the qualification's.

/** Build (or rebuild) the filled graph for the card. */
export async function loadOntology(
  _clientProject: string,
  qualificationId: string,
): Promise<OntologyState> {
  try {
    const projectId = await qualificationForCaller(qualificationId);
    if (!projectId) return { ok: false, error: REFUSED[404] };
    const built = await ontologyService.build(projectId, qualificationId);
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
  _clientProject: string,
  qualificationId: string,
  nodeId: string,
  change: NodePatch,
): Promise<OntologyState> {
  try {
    const write = await qualificationForWriter(qualificationId);
    if (!write.ok) return { ok: false, error: REFUSED[write.status] };
    const built = await ontologyService.patchNode(
      write.project,
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
  _clientProject: string,
  qualificationId: string,
): Promise<OntologyState> {
  try {
    const write = await qualificationForWriter(qualificationId);
    if (!write.ok) return { ok: false, error: REFUSED[write.status] };
    const built = await ontologyService.resetPatch(write.project, qualificationId);
    revalidatePath(`/qualify/${qualificationId}`);
    return { ok: true, view: built.view, problems: built.problems };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not reset.",
    };
  }
}
