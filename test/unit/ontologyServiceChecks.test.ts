import { describe, it, expect, vi } from "vitest";
import { OntologyService } from "@/server/services/OntologyService";
import {
  OntologyClient,
  OntologyRejected,
} from "@/server/services/OntologyClient";
import { transactional } from "../support/ledgerRepo";

// Code review 2026-10-05:
// - B1: a draft the builder refuses (a VAIR term it does not know) was stored, and the card's graph
//   then failed on every read. checkExtracted builds the draft first; the route stores only what builds.
// - B3: patchNode built the graph from the corrections read before the row lock, but saved the ones
//   merged under it; a correction saved meanwhile was missing from the stored graph and the view.

const card = {
  id: "q1",
  questionnaireVersionId: null,
  ontologyExtracted: { techniques: [] },
  ontologyPatch: { a: { label: "A0" } },
};

function setup(locked: Record<string, unknown> | null) {
  const builds: unknown[][] = [];
  const client = {
    build: vi.fn(async (q: unknown, extracted: unknown, patch: unknown) => {
      builds.push([extracted, patch]);
      return { view: { patch }, turtle: "", jsonld: {} };
    }),
  };
  const saved: unknown[] = [];
  const repo = transactional({
    find: vi.fn(async () => card),
    isLatest: vi.fn(async () => true),
    cardSummary: vi.fn(async () => ({ id: "q1", systemId: "v2" })),
    saveOntologyPatch: vi.fn(async () => ({})),
    lockedPatch: vi.fn(async () => locked),
  });
  const svc = new OntologyService(
    (async () => repo) as never,
    () => client as never,
    (() => ({
      save: vi.fn(async (_id: string, built: unknown) => {
        saved.push(built);
      }),
    })) as never,
    (async () => ({ resolve: async () => null })) as never,
  );
  return { svc, client, builds, saved, repo };
}

vi.mock("@/server/services/cardLatest", () => ({
  assertLatestCard: vi.fn(async () => undefined),
}));
vi.mock("@/server/services/QualificationExporter", () => ({
  toExport: (q: { id: string }) => ({ id: q.id }),
}));

describe("checkExtracted (B1)", () => {
  it("builds the incoming draft with the card's stored corrections, storing nothing", async () => {
    const { svc, builds, saved } = setup(null);
    await svc.checkExtracted("p", "q1", {
      techniques: [{ label: "x", vair: "Foo" }],
    });
    expect(builds).toEqual([
      [{ techniques: [{ label: "x", vair: "Foo" }] }, { a: { label: "A0" } }],
    ]);
    expect(saved).toEqual([]);
  });

  it("lets the builder's refusal through", async () => {
    const { svc, client } = setup(null);
    client.build.mockRejectedValueOnce(
      new OntologyRejected("'Foo' is not a term VAIR defines"),
    );
    await expect(svc.checkExtracted("p", "q1", {})).rejects.toBeInstanceOf(
      OntologyRejected,
    );
  });
});

describe("patchNode builds what it stores (B3)", () => {
  it("rebuilds from the corrections merged under the lock when one was saved meanwhile", async () => {
    // B corrects node b; A's correction of node a ("A1") was saved after B read the card ("A0")
    const { svc, builds, saved } = setup({ a: { label: "A1" } });
    const built = await svc.patchNode("p", "q1", "b", { label: "B1" });
    const stored = { a: { label: "A1" }, b: { label: "B1" } };
    expect(builds.at(-1)).toEqual([card.ontologyExtracted, stored]);
    expect(saved).toEqual([
      { view: { patch: stored }, turtle: "", jsonld: {} },
    ]);
    expect(built).toEqual({ view: { patch: stored }, turtle: "", jsonld: {} });
  });

  it("builds once when nothing changed meanwhile", async () => {
    const { svc, builds } = setup({ a: { label: "A0" } });
    await svc.patchNode("p", "q1", "b", { label: "B1" });
    expect(builds).toHaveLength(1);
  });
});

describe("OntologyClient marks the builder's refusal", () => {
  it("a 422 is an OntologyRejected with the service's message", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ detail: "'Foo' is not a term VAIR defines" }),
          { status: 422 },
        ),
      );
    const err = await new OntologyClient("http://o", fetchMock)
      .build({} as never)
      .catch((e) => e);
    expect(err).toBeInstanceOf(OntologyRejected);
    expect(err.message).toBe("'Foo' is not a term VAIR defines");
  });

  it("any other failure is not", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("down", { status: 502 }));
    const err = await new OntologyClient("http://o", fetchMock)
      .build({} as never)
      .catch((e) => e);
    expect(err).not.toBeInstanceOf(OntologyRejected);
  });
});
