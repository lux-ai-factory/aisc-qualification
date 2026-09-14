import type { Prisma } from "@prisma/client";
import {
  QualificationRepository,
  qualificationRepository,
} from "@/server/repositories/QualificationRepository";
import type {
  OntologyExtracted,
  OntologyPatch,
  NodePatch,
} from "@/domain/OntologyView";
import { OntologyClient, type OntologyBuild } from "./OntologyClient";
import { toExport } from "./QualificationExporter";
import {
  knowledgeGraphStore,
  type KnowledgeGraphStore,
} from "./KnowledgeGraphStore";

/**
 * The knowledge graph for one qualification.
 *
 * Rebuilt from the form, the drafted extraction and the reviewer's patch, so a
 * change to any of the three shows on the next read. Only those three are the
 * source of truth; the built graph is stored alongside them.
 */
export class OntologyService {
  constructor(
    private readonly repo: QualificationRepository = qualificationRepository,
    private readonly clientFactory: () => OntologyClient = () =>
      OntologyClient.fromEnv(),
    private readonly graphs: KnowledgeGraphStore = knowledgeGraphStore,
  ) {}

  /**
   * Build the graph and store it if it has changed.
   *
   * Storing on the read path also catches changes that come from the code or a
   * vendored ontology rather than the answers. Digests are compared first, so
   * repeated reads of an unchanged card write nothing.
   */
  async build(qualificationId: string): Promise<OntologyBuild> {
    const q = await this.repo.find(qualificationId);
    if (!q) throw new Error("Qualification not found.");
    const built = await this.clientFactory().build(
      toExport(q),
      (q.ontologyExtracted as OntologyExtracted | null) ?? undefined,
      (q.ontologyPatch as OntologyPatch | null) ?? undefined,
    );
    await this.graphs.save(qualificationId, built);
    return built;
  }

  /**
   * Record one reviewer correction and rebuild. The patch is merged per node, so
   * correcting a label does not discard a VAIR type set earlier. An empty change
   * removes that node's entry, which reverts it to the generated value.
   */
  async patchNode(
    qualificationId: string,
    nodeId: string,
    change: NodePatch,
  ): Promise<OntologyBuild> {
    const q = await this.repo.find(qualificationId);
    if (!q) throw new Error("Qualification not found.");

    const patch: OntologyPatch = {
      ...((q.ontologyPatch as OntologyPatch | null) ?? {}),
    };
    const merged: NodePatch = { ...(patch[nodeId] ?? {}), ...change };
    if (Object.keys(merged).length === 0) delete patch[nodeId];
    else patch[nodeId] = merged;

    // Build BEFORE saving, so a rejected term (an invented VAIR type) leaves the
    // stored patch untouched rather than persisting something the graph refuses.
    const built = await this.clientFactory().build(
      toExport(q),
      (q.ontologyExtracted as OntologyExtracted | null) ?? undefined,
      patch,
    );
    await this.repo.saveOntologyPatch(
      qualificationId,
      patch as unknown as Prisma.InputJsonValue,
    );
    await this.graphs.save(qualificationId, built);
    return built;
  }

  /** Drop every correction and go back to the generated graph.
   *
   * The corrected states stay in the archive: discarding an edit is a decision,
   * and the record should show that it was made. */
  async resetPatch(qualificationId: string): Promise<OntologyBuild> {
    await this.repo.saveOntologyPatch(qualificationId, {});
    return this.build(qualificationId);
  }
}

export const ontologyService = new OntologyService();
