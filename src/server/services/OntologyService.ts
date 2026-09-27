import type { Prisma } from "@prisma/client";
import {
  repositoryFor,
  type QualificationRepository,
  type RepositoryFor,
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
    await repo.saveOntologyPatch(
      qualificationId,
      patch as unknown as Prisma.InputJsonValue,
    );
    await this.graphsFor(repo).save(qualificationId, built);
    return built;
  }

  /** Drop every correction and go back to the generated graph.
   *
   * The corrected states stay in the archive: discarding an edit is a decision,
   * and the record should show that it was made. */
  async resetPatch(projectId: string, qualificationId: string): Promise<OntologyBuild> {
    // Read first, so a qualification of another project is refused before
    // anything is written rather than after.
    const { repo } = await this.findChangeable(projectId, qualificationId);
    await repo.saveOntologyPatch(qualificationId, {});
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
