import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  KnowledgeGraphStore,
  stampOf,
} from "@/server/services/KnowledgeGraphStore";
import type { OntologyBuild } from "@/server/services/OntologyClient";

const built = (digest: string, turtle = "@prefix ex: <x> .", nodes = 59) =>
  ({
    view: { counts: { nodes, triples: 400 } },
    turtle,
    jsonld: `{"@graph":["${digest}"]}`,
    digest,
    problems: [],
  }) as unknown as OntologyBuild;

function fakeRepo() {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    rows,
    knowledgeGraph: vi.fn(async (id: string) => rows.get(id) ?? null),
    saveKnowledgeGraph: vi.fn(async (row: Record<string, unknown>) => {
      rows.set(row.qualificationId as string, row);
      return row;
    }),
  };
}

describe("one knowledge graph per system", () => {
  let repo: ReturnType<typeof fakeRepo>;
  let store: KnowledgeGraphStore;

  beforeEach(() => {
    repo = fakeRepo();
    store = new KnowledgeGraphStore(repo as never);
  });

  it("keeps the graph, both serialisations, for a system that had none", async () => {
    await store.save("q1", built("abc"));
    const row = repo.rows.get("q1")!;
    expect(row.turtle).toBe("@prefix ex: <x> .");
    expect(row.jsonld).toContain("abc");
    expect(row.nodes).toBe(59);
    expect(row.triples).toBe(400);
  });

  it("replaces it when the graph changes", async () => {
    await store.save("q1", built("abc"));
    await store.save("q1", built("def", "@prefix ex: <y> ."));
    expect(repo.rows.size).toBe(1);
    expect(repo.rows.get("q1")!.digest).toBe("def");
    expect(repo.saveKnowledgeGraph).toHaveBeenCalledTimes(2);
  });

  it("writes nothing when a rebuild produces the same graph", async () => {
    // Every page view rebuilds. Rewriting an unchanged graph would be a write
    // per read, and would move builtAt for no reason.
    await store.save("q1", built("abc"));
    const result = await store.save("q1", built("abc"));
    expect(result.saved).toBe(false);
    expect(repo.saveKnowledgeGraph).toHaveBeenCalledTimes(1);
  });

  it("keeps systems apart", async () => {
    await store.save("q1", built("abc"));
    await store.save("q2", built("abc"));
    expect([...repo.rows.keys()]).toEqual(["q1", "q2"]);
  });

  it("records what built it, from the graph's own stamp", async () => {
    const turtle = `<x> <https://lux-ai-factory.github.io/qualification/ns#builtWith> "airo_min:1.0", "airo.ttl:sha256:abc", "vair.ttl:sha256:def" .`;
    await store.save("q1", built("abc", turtle));
    expect(repo.rows.get("q1")!.stamp).toEqual([
      "airo.ttl:sha256:abc",
      "airo_min:1.0",
      "vair.ttl:sha256:def",
    ]);
  });

  it("survives a failed write", async () => {
    repo.saveKnowledgeGraph.mockRejectedValueOnce(new Error("disk full"));
    await expect(store.save("q1", built("abc"))).resolves.toEqual({
      saved: false,
    });
  });

  it("serves the stored bytes for a download", async () => {
    // Two serialisations of one graph differ, because blank nodes are
    // relabelled. What someone downloads has to be the bytes we kept.
    await store.save("q1", built("abc", "@prefix ex: <stored> ."));
    const doc = await store.document("q1", built("abc", "@prefix ex: <fresh> ."), "turtle");
    expect(doc).toContain("stored");
  });

  it("falls back to the fresh build when nothing is stored", async () => {
    const doc = await store.document("q1", built("abc", "@prefix ex: <fresh> ."), "turtle");
    expect(doc).toContain("fresh");
  });

  it("falls back when the stored graph is a different one", async () => {
    // A stale row must not be served as though it were the current graph.
    await store.save("q1", built("old", "@prefix ex: <old> ."));
    const doc = await store.document("q1", built("new", "@prefix ex: <new> ."), "turtle");
    expect(doc).toContain("new");
  });
});

describe("reading the build stamp", () => {
  it("pulls every builtWith value out of the turtle, sorted", () => {
    expect(
      stampOf(`<x> <ns#builtWith> "b", "a" .`),
    ).toEqual(["a", "b"]);
  });

  it("returns nothing for a graph with no stamp", () => {
    expect(stampOf("@prefix ex: <x> .")).toEqual([]);
  });
});

describe("serving a graph when the builder is unavailable", () => {
  const stored = {
    digest: "abc",
    turtle: "@prefix ex: <stored> .",
    jsonld: '{"@graph":["stored"]}',
  };

  it("serves the kept graph when the build fails", async () => {
    // The point of keeping it: a system whose graph exists should not become
    // undownloadable because a sidecar is restarting.
    const repo = { knowledgeGraph: vi.fn(async () => stored) };
    const store = new KnowledgeGraphStore(repo as never);
    const doc = await store.deliver("q1", "turtle", async () => {
      throw new Error("ontology service unreachable");
    });
    expect(doc).toEqual({ document: stored.turtle, fromStore: true });
  });

  it("prefers a fresh build, since it reflects the latest answers", async () => {
    const repo = {
      knowledgeGraph: vi.fn(async () => stored),
      saveKnowledgeGraph: vi.fn(async () => stored),
    };
    const store = new KnowledgeGraphStore(repo as never);
    const doc = await store.deliver("q1", "turtle", async () =>
      ({
        digest: "def",
        turtle: "@prefix ex: <fresh> .",
        jsonld: "{}",
        view: { counts: { nodes: 1, triples: 1 } },
      }) as never,
    );
    expect(doc.document).toContain("fresh");
    expect(doc.fromStore).toBe(false);
  });

  it("says nothing is available when neither the builder nor the store has it", async () => {
    const repo = { knowledgeGraph: vi.fn(async () => null) };
    const store = new KnowledgeGraphStore(repo as never);
    await expect(
      store.deliver("q1", "turtle", async () => {
        throw new Error("unreachable");
      }),
    ).rejects.toThrow(/unreachable/);
  });
});
