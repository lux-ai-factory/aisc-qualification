import { describe, it, expect, vi, beforeEach } from "vitest";
import { transactional } from "../support/ledgerRepo";

// The card page's "Regenerate" button: the same filler run a save starts, asked
// for again. It writes (the filler replaces the draft), so it takes the same
// doors as every other change to a card: write access to the project it is
// given, the card in that project's database, and only the latest version.

const PROJECT_ID = "a1b2c3d4-0000-4000-8000-000000000002";
const cards: Record<string, { id: string; systemId: string; revision: number }> = {
  q1: { id: "q1", systemId: "v2", revision: 2 },
  q1first: { id: "q1first", systemId: "v2", revision: 1 },     // v2's card before its correction
  old: { id: "old", systemId: "v1", revision: 1 },
};

const repo = transactional({
  cardSummary: vi.fn(async (id: string) => cards[id] ?? null),
  cardStanding: vi.fn(async (id: string) => {
    const card = cards[id];
    if (!card) return null;
    const highest = Math.max(
      ...Object.values(cards).filter((c) => c.systemId === card.systemId).map((c) => c.revision),
    );
    return { systemId: card.systemId, latestRevision: card.revision === highest };
  }),
});
const actionDoor = vi.fn(
  async (_p: string, _o: unknown) =>
    ({ db: {} }) as { db?: object; error?: string },
);
const requestFill = vi.fn(async (_p: string, _id: string) => true);
const fillInFlight = vi.fn(async (_p: string, _id: string) => false);
const latestVersion = vi.fn(async () => ({ pid: "v2" }));
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (p: string) => revalidatePath(p),
}));
vi.mock("@/lib/projectDb", () => ({
  REFUSED: { 403: "403: you can read this project but not change it.", 404: "Qualification not found." },
  projectDbForAction: (p: string, o: unknown) => actionDoor(p, o),
}));
vi.mock("@/server/repositories/QualificationRepository", () => ({
  QualificationRepository: class {
    constructor() {
      return repo;
    }
  },
}));
vi.mock("@/server/services/PlatformClient", () => ({
  platformClient: { latestVersion: () => latestVersion() },
}));
vi.mock("@/server/services/FillerClient", () => ({
  requestFill: (p: string, id: string) => requestFill(p, id),
  fillInFlight: (p: string, id: string) => fillInFlight(p, id),
}));

async function rerun(project: string, id: string) {
  const { rerunFill } =
    await import("@/app/p/[project]/qualify/[id]/fill-actions");
  return rerunFill(project, id);
}

beforeEach(() => {
  vi.clearAllMocks();
  actionDoor.mockResolvedValue({ db: {} });
  requestFill.mockResolvedValue(true);
  fillInFlight.mockResolvedValue(false);
});

describe("regenerating the AI card", () => {
  it("asks the filler to run again for this card, in this project", async () => {
    const state = await rerun(PROJECT_ID, "q1");
    expect(state).toEqual({ ok: true });
    expect(actionDoor).toHaveBeenCalledWith(PROJECT_ID, { write: true });
    expect(requestFill).toHaveBeenCalledWith(PROJECT_ID, "q1");
  });

  it("is refused to a caller who cannot write the project, and starts nothing", async () => {
    actionDoor.mockResolvedValue({
      error: "403: you cannot change this project.",
    });
    const state = await rerun(PROJECT_ID, "q1");
    expect(state.ok).toBe(false);
    if (!state.ok) expect(state.error).toMatch(/403/);
    expect(requestFill).not.toHaveBeenCalled();
  });

  it("is refused for a card that is not in this project's database", async () => {
    const state = await rerun(PROJECT_ID, "elsewhere");
    expect(state.ok).toBe(false);
    if (!state.ok) expect(state.error).toMatch(/not found/i);
    expect(requestFill).not.toHaveBeenCalled();
  });

  it("is refused for an older version's card, which is kept as it was", async () => {
    const state = await rerun(PROJECT_ID, "old");
    expect(state.ok).toBe(false);
    if (!state.ok) expect(state.error).toMatch(/older version/);
    expect(requestFill).not.toHaveBeenCalled();
  });

  it("is refused for an earlier revision of the latest version's card", async () => {
    const state = await rerun(PROJECT_ID, "q1first");
    expect(state.ok).toBe(false);
    if (!state.ok) expect(state.error).toMatch(/403/);
    expect(requestFill).not.toHaveBeenCalled();
  });

  it("says so when the filler did not take the run", async () => {
    requestFill.mockResolvedValue(false);
    const state = await rerun(PROJECT_ID, "q1");
    expect(state.ok).toBe(false);
    if (!state.ok) expect(state.error).toMatch(/card agent/i);
  });
});

describe("a second click while a run is going", () => {
  it("says a run is already going, and records no request the agent would ignore", async () => {
    fillInFlight.mockResolvedValue(true);
    const transaction = vi.spyOn(
      repo as unknown as { transaction: () => unknown },
      "transaction",
    );
    const state = await rerun(PROJECT_ID, "q1");
    expect(state.ok).toBe(false);
    if (!state.ok) expect(state.error).toMatch(/already/i);
    expect(fillInFlight).toHaveBeenCalledWith(PROJECT_ID, "q1");
    expect(transaction).not.toHaveBeenCalled();
    expect(requestFill).not.toHaveBeenCalled();
  });
});
