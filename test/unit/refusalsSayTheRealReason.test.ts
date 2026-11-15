import { describe, it, expect, vi, beforeEach } from "vitest";

// A refusal is said in words, without an HTTP code in front, and with its real
// reason: a page left open across a correction is told the card was corrected
// since (and which revision is current), not that it is "of an older version";
// a node edit that fails for an unexpected reason gets a fixed sentence, never the
// raw exception text.

const PID = "a1b2c3d4-0000-4000-8000-000000000002";
const m = vi.hoisted(() => ({
  latestVersion: vi.fn(),
  patchNode: vi.fn(),
}));

vi.mock("@/server/services/PlatformClient", () => ({
  PlatformClient: class {},
  platformClient: { latestVersion: m.latestVersion },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/projectDb", async (orig) => ({
  ...(await orig<typeof import("@/lib/projectDb")>()),
  projectDbForAction: async () => ({ db: {} }),
}));
vi.mock("@/server/repositories/QualificationRepository", () => ({
  QualificationRepository: class {
    cardSummary = async () => ({ id: "c2" });
  },
}));
vi.mock("@/server/services/OntologyService", () => ({
  ontologyService: { patchNode: m.patchNode },
}));
vi.mock("@/vendor/aisc-ledger/emit", () => ({ emitEvent: vi.fn() }));

// v2's card was corrected: c2r1 is its first revision, c2 the current one
const STANDING: Record<string, { systemId: string; latestRevision: boolean }> = {
  c1: { systemId: "v1", latestRevision: true },
  c2r1: { systemId: "v2", latestRevision: false },
  c2: { systemId: "v2", latestRevision: true },
};
const cards = { cardStanding: async (id: string) => STANDING[id] ?? null } as never;

async function refusalFor(cardId: string): Promise<string> {
  const { assertLatestCard } = await import("@/server/services/cardLatest");
  try {
    await assertLatestCard(PID, cardId, cards);
  } catch (err) {
    return (err as Error).message;
  }
  return "";
}

beforeEach(() => {
  vi.clearAllMocks();
  m.latestVersion.mockResolvedValue({ pid: "v2", number: 2 });
});

describe("refusals say their reason in words", () => {
  it("an earlier revision of the latest version is told the card was corrected since", async () => {
    const msg = await refusalFor("c2r1");
    expect(msg).not.toMatch(/older version/);
    expect(msg).toMatch(/corrected/i);
  });

  it("a card of an older version is refused without an HTTP code in front", async () => {
    expect(await refusalFor("c1")).not.toMatch(/^\d{3}:/);
  });

  it("a viewer's refused write carries no HTTP code in front", async () => {
    const { REFUSED } = await import("@/lib/projectDb");
    expect(REFUSED[403]).not.toMatch(/^\d{3}:/);
  });

  it("a node edit that fails unexpectedly gets a fixed sentence, not the exception text", async () => {
    m.patchNode.mockRejectedValue(
      new Error("connect ECONNREFUSED 172.18.0.7:8000 at TCPConnectWrap.afterConnect"),
    );
    const { patchOntologyNode } = await import(
      "@/app/p/[project]/qualify/[id]/ontology-actions"
    );
    const out = await patchOntologyNode(PID, "c2", "system", { label: "MCAS" } as never);
    expect(out.ok).toBe(false);
    expect((out as { error: string }).error).not.toMatch(/ECONNREFUSED|TCPConnectWrap/);
  });
});
