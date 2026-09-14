import {
  qualificationRepository,
  type QualificationRepository,
} from "@/server/repositories/QualificationRepository";
import type { OntologyBuild } from "./OntologyClient";

// Stores the knowledge graph built for one system: one row per qualification,
// replaced when the graph changes.
//
// The graph is still rebuilt from the answers, the draft and the patch on every
// read. This store keeps the result so it can be handed over, and so a download
// and the stored row are the same bytes.

/** The `qual:builtWith` stamps the graph carries, read out of its Turtle. */
export function stampOf(turtle: string): string[] {
  const stamps = new Set<string>();
  for (const match of turtle.matchAll(/builtWith>?\s+((?:"[^"]*"\s*,?\s*)+)/g)) {
    for (const value of match[1].matchAll(/"([^"]*)"/g)) stamps.add(value[1]);
  }
  return [...stamps].sort();
}

export class KnowledgeGraphStore {
  constructor(
    private readonly repo: QualificationRepository = qualificationRepository,
  ) {}

  /** Keep this graph, unless the stored one is already it. Never throws. */
  async save(
    qualificationId: string,
    built: OntologyBuild,
  ): Promise<{ saved: boolean }> {
    try {
      const stored = await this.repo.knowledgeGraph(qualificationId);
      if (stored?.digest === built.digest) return { saved: false };

      await this.repo.saveKnowledgeGraph({
        qualificationId,
        digest: built.digest,
        turtle: built.turtle,
        jsonld: built.jsonld,
        stamp: stampOf(built.turtle),
        nodes: built.view.counts.nodes,
        triples: built.view.counts.triples,
      });
      return { saved: true };
    } catch {
      // A failed write must not take down a page view or a download.
      return { saved: false };
    }
  }

  /**
   * The bytes for a download: the stored ones when they are this graph.
   *
   * Serialising one graph twice gives different documents (blank nodes are
   * relabelled), so the file has to be the stored bytes. Falls back to the
   * fresh build when the store holds a different graph or none.
   */
  async document(
    qualificationId: string,
    built: OntologyBuild,
    format: "turtle" | "jsonld",
  ): Promise<string> {
    try {
      const stored = await this.repo.knowledgeGraph(qualificationId);
      if (stored?.digest === built.digest) {
        return format === "turtle" ? stored.turtle : stored.jsonld;
      }
    } catch {
      // fall through
    }
    return format === "turtle" ? built.turtle : built.jsonld;
  }

  /**
   * The graph to hand over: freshly built when the builder is reachable, the
   * stored one when it is not. A fresh build wins because it reflects the
   * latest answers.
   */
  async deliver(
    qualificationId: string,
    format: "turtle" | "jsonld",
    build: () => Promise<OntologyBuild>,
  ): Promise<{ document: string; fromStore: boolean }> {
    try {
      const built = await build();
      return {
        document: await this.document(qualificationId, built, format),
        fromStore: false,
      };
    } catch (err) {
      const stored = await this.repo.knowledgeGraph(qualificationId);
      if (!stored) throw err;
      return {
        document: format === "turtle" ? stored.turtle : stored.jsonld,
        fromStore: true,
      };
    }
  }
}

export const knowledgeGraphStore = new KnowledgeGraphStore();
