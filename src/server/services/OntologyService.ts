import type { Prisma } from "@prisma/client";
import {
  repositoryFor,
  type QualificationRepository,
  type RepositoryFor,
  type Tx,
} from "@/server/repositories/QualificationRepository";
import type {
  OntologyExtracted,
  OntologyPatch,
  NodePatch,
} from "@/domain/OntologyView";
import { OntologyClient, type OntologyBuild } from "./OntologyClient";
import { toExport } from "./QualificationExporter";
import { questionnaireResolverFor } from "./QuestionnaireService";
import type { QuestionnaireResolver } from "@/domain/forms/types";
import { assertLatestCard } from "./cardLatest";
import { KnowledgeGraphStore } from "./KnowledgeGraphStore";

/**
 * The knowledge graph for one qualification.
 *
 * Rebuilt from the form, the drafted extraction and the reviewer's patch, so a
 * change to any of the three shows on the next read. Only those three are the
 * source of truth; the built graph is stored alongside them.
 *
 * Each call names its project, and the card is read from that project's own
 * database: a card of another project is not found there.
 */
export class OntologyService {
  constructor(
    private readonly repos: RepositoryFor = repositoryFor,
    private readonly clientFactory: () => OntologyClient = () =>
      OntologyClient.fromEnv(),
    private readonly graphsFor: (repo: QualificationRepository) => KnowledgeGraphStore = (repo) =>
      new KnowledgeGraphStore(repo),
    private readonly formsFor: (projectId: string) => Promise<QuestionnaireResolver> = questionnaireResolverFor,
  ) {}

  /** The card's export with its form version, read in the card's own project;
   *  a card saved before forms existed reads as the default version, and an
   *  unknown one as no form. */
  private async exportOf(projectId: string, q: Parameters<typeof toExport>[0]) {
    const form = await (await this.formsFor(projectId)).resolve(q.questionnaireVersionId ?? null);
    return toExport(q, form ?? undefined);
  }

  /**
   * Build the graph and store it if it has changed.
   *
   * Storing on the read path also catches changes that come from the code or a
   * vendored ontology rather than the answers. Digests are compared first, so
   * repeated reads of an unchanged card write nothing.
   */
  async build(projectId: string, qualificationId: string): Promise<OntologyBuild> {
    const repo = await this.repos(projectId);
    const q = await repo.find(qualificationId);
    if (!q) throw new Error("Qualification not found.");
    const built = await this.clientFactory().build(
      await this.exportOf(projectId, q),
      (q.ontologyExtracted as OntologyExtracted | null) ?? undefined,
      (q.ontologyPatch as OntologyPatch | null) ?? undefined,
    );
    await this.graphsFor(repo).save(qualificationId, built);
    return built;
  }

  /**
   * Record one reviewer correction and rebuild. The patch is merged per node, so
   * correcting a label does not discard a VAIR type set earlier. An empty change
   * removes that node's entry, which reverts it to the generated value.
   */
  async patchNode(
    projectId: string,
    qualificationId: string,
    nodeId: string,
    change: NodePatch,
    /** The caller's ledger event, written in the save's own transaction (ledger phase 5). */
    record: Recorder<{ node: string; before: NodePatch | null; after: NodePatch | null }> = async () => undefined,
  ): Promise<OntologyBuild> {
    const { repo, q } = await this.findChangeable(projectId, qualificationId);

    const patch: OntologyPatch = {
      ...((q.ontologyPatch as OntologyPatch | null) ?? {}),
    };
    const merged: NodePatch = { ...(patch[nodeId] ?? {}), ...change };
    if (Object.keys(merged).length === 0) delete patch[nodeId];
    else patch[nodeId] = merged;

    // Build BEFORE saving, so a rejected term (an invented VAIR type) leaves the
    // stored patch untouched rather than persisting something the graph refuses.
    const built = await this.clientFactory().build(
      await this.exportOf(projectId, q),
      (q.ontologyExtracted as OntologyExtracted | null) ?? undefined,
      patch,
    );
    await repo.transaction(async (r, tx) => {
      // the patch as it is now, locked: a correction saved meanwhile is kept, not overwritten (review m2)
      const now = ((await r.lockedPatch(qualificationId)) as OntologyPatch | null) ?? {};
      const before = now[nodeId] ?? null;
      const fresh: OntologyPatch = { ...now };
      const mergedNow: NodePatch = { ...(fresh[nodeId] ?? {}), ...change };
      if (Object.keys(mergedNow).length === 0) delete fresh[nodeId];
      else fresh[nodeId] = mergedNow;
      const after = fresh[nodeId] ?? null;
      await r.saveOntologyPatch(qualificationId, fresh as unknown as Prisma.InputJsonValue);
      await r.recordHistory({
        qualificationId,
        kind: "node_corrected",
        subject: nodeId,
        before: before as Prisma.InputJsonValue | null,
        after: after as Prisma.InputJsonValue | null,
      });
      await record(tx, { node: nodeId, before, after });
    });
    await this.graphsFor(repo).save(qualificationId, built);
    return built;
  }

  /** Drop every correction and go back to the generated graph.
   *
   * The corrected states stay in the card's history (card_history) and the
   * ledger: discarding an edit is a decision, and the record shows that it was
   * made. */
  async resetPatch(
    projectId: string,
    qualificationId: string,
    record: Recorder<{ before: OntologyPatch }> = async () => undefined,
  ): Promise<OntologyBuild> {
    // Read first, so a qualification of another project is refused before
    // anything is written rather than after.
    const { repo } = await this.findChangeable(projectId, qualificationId);
    // The discarded corrections are kept (card_history), with the ledger's event (ledger phase 5), read
    // inside the transaction with the row locked, so a correction saved meanwhile is discarded too, and kept.
    await repo.transaction(async (r, tx) => {
      const before = ((await r.lockedPatch(qualificationId)) as OntologyPatch | null) ?? {};
      if (Object.keys(before).length === 0) return;                  // nothing to discard, nothing to record
      await r.saveOntologyPatch(qualificationId, {});
      await r.recordHistory({ qualificationId, kind: "corrections_discarded", before: before as Prisma.InputJsonValue });
      await record(tx, { before });
    });
    return this.build(projectId, qualificationId);
  }

  /** The qualification, if it is of this project and its card is the latest
   *  version's: only that card changes, an older one is kept as it was. */
  private async findChangeable(projectId: string, qualificationId: string) {
    const repo = await this.repos(projectId);
    const q = await repo.find(qualificationId);
    if (!q) throw new Error("Qualification not found.");
    await assertLatestCard(projectId, q.systemId);
    return { repo, q };
  }
}

export const ontologyService = new OntologyService();

/** A caller's ledger event for a change, run inside the change's transaction. */
export type Recorder<T> = (tx: Tx, change: T) => Promise<unknown>;

