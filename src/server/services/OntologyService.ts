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
import { carryReview, NO_REVIEW, type ReviewCarry } from "@/domain/carryReview";
import type { QualificationWithAnswers } from "@/server/repositories/QualificationRepository";
import type { QualificationExport } from "./QualificationExporter";
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
   * Build the card with a draft that is not stored yet, and the card's stored corrections; nothing
   * is saved. The builder's refusal comes through as OntologyRejected: a draft it refuses must not
   * be stored, or the card's graph fails on every read.
   */
  async checkExtracted(projectId: string, qualificationId: string, extracted: OntologyExtracted): Promise<void> {
    const repo = await this.repos(projectId);
    const q = await repo.find(qualificationId);
    if (!q) throw new Error("Qualification not found.");
    await this.clientFactory().build(
      await this.exportOf(projectId, q),
      extracted,
      (q.ontologyPatch as OntologyPatch | null) ?? undefined,
    );
  }

  /**
   * What the next card version takes from `from`, the card before it: the corrections whose item
   * is the same item in the next card, and the draft when nothing it was read from changed (the
   * rule is domain/carryReview's). `next` is the next card's export, read before it is stored.
   *
   * The builder judges: `from` is built as it shows, the next card as generated, and the
   * corrections that come along are built once more on the next card, so a set the builder
   * refuses throws (OntologyRejected) instead of being stored. Nothing is written here.
   */
  async reviewToCarry(
    projectId: string,
    from: QualificationWithAnswers,
    next: QualificationExport,
  ): Promise<ReviewCarry> {
    const patch = (from.ontologyPatch as OntologyPatch | null) ?? null;
    const extracted = (from.ontologyExtracted as OntologyExtracted | null) ?? null;
    if (!extracted && Object.keys(patch ?? {}).length === 0) {
      return NO_REVIEW;
    }
    const client = this.clientFactory();
    const before = await this.exportOf(projectId, from);
    const sameContent = sameExport(before, next);
    const draft = sameContent ? extracted : null;
    const carry = carryReview({
      patch,
      extracted,
      before: (await client.build(before, extracted ?? undefined, patch ?? undefined)).view,
      after: (await client.build(next, draft ?? undefined, undefined)).view,
      sameContent,
    });
    if (carry.patch) await client.build(next, carry.extracted ?? undefined, carry.patch);
    return carry;
  }

  /**
   * Record one reviewer correction and rebuild. The change is the node's whole entry (the
   * editor sends every field it shows), so it replaces what was stored: a field left out
   * goes back to the generated value, which is how a reviewer drops a term or clears a note.
   * An empty change removes the entry, reverting the node. A change equal to the stored
   * entry is not a correction: nothing is written, recorded or emitted.
   */
  async patchNode(
    projectId: string,
    qualificationId: string,
    nodeId: string,
    change: NodePatch,
    /** The caller's ledger event, written in the save's own transaction. */
    record: Recorder<{ node: string; before: NodePatch | null; after: NodePatch | null }> = async () => undefined,
  ): Promise<OntologyBuild> {
    const { repo, q } = await this.findChangeable(projectId, qualificationId);

    const patch: OntologyPatch = {
      ...((q.ontologyPatch as OntologyPatch | null) ?? {}),
    };
    if (Object.keys(change).length === 0) delete patch[nodeId];
    else patch[nodeId] = change;

    // Build before saving, so a rejected term (an invented VAIR type) leaves the
    // stored patch untouched rather than persisting something the graph refuses.
    const built = await this.clientFactory().build(
      await this.exportOf(projectId, q),
      (q.ontologyExtracted as OntologyExtracted | null) ?? undefined,
      patch,
    );
    let stored: OntologyPatch = patch;
    await repo.transaction(async (r, tx) => {
      // the patch as it is now, locked: a correction saved meanwhile is kept, not overwritten
      const now = ((await r.lockedPatch(qualificationId)) as OntologyPatch | null) ?? {};
      const before = now[nodeId] ?? null;
      const fresh: OntologyPatch = { ...now };
      if (Object.keys(change).length === 0) delete fresh[nodeId];
      else fresh[nodeId] = change;
      const after = fresh[nodeId] ?? null;
      stored = fresh;
      if (sameEntry(before, after)) {
        stored = now;
        return;
      }
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
    // A correction saved meanwhile is in what was stored but not in what was built: build that.
    const graph =
      JSON.stringify(stored) === JSON.stringify(patch)
        ? built
        : await this.clientFactory().build(
            await this.exportOf(projectId, q),
            (q.ontologyExtracted as OntologyExtracted | null) ?? undefined,
            stored,
          );
    await this.graphsFor(repo).save(qualificationId, graph);
    return graph;
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
    // The discarded corrections are kept in card_history, with the ledger event. They are read inside
    // the transaction with the row locked, so a correction saved meanwhile is discarded and kept too.
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

/** Whether two node entries hold the same fields and values, in any key order. */
function sameEntry(a: NodePatch | null, b: NodePatch | null): boolean {
  if (a === null || b === null) return a === b;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(
    (k) => k in b && a[k as keyof NodePatch] === b[k as keyof NodePatch],
  );
}

/** Two exports of the same content: everything but the card's own id. */
function sameExport(a: QualificationExport, b: QualificationExport): boolean {
  const { id: _a, ...left } = a;
  const { id: _b, ...right } = b;
  void _a;
  void _b;
  return JSON.stringify(left) === JSON.stringify(right);
}
