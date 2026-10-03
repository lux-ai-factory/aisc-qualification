import { describe, it, expect, vi, beforeEach } from "vitest";
import { transactional } from "../support/ledgerRepo";

// The card page's "Regenerate" button: the same filler run a save starts, asked
// for again. It writes (the filler replaces the draft), so it takes the same
// doors as every other change to a card: write access to the project it is
// given, the card in that project's database, and only the latest version.

const PROJECT_ID = "a1b2c3d4-0000-4000-8000-000000000002";
const cards: Record<string, { id: string; systemId: string }> = {
  q1: { id: "q1", systemId: "v2" },
  old: { id: "old", systemId: "v1" },
};

const repo = transactional({ cardSummary: vi.fn(async (id: string) => cards[id] ?? null) });
const actionDoor = vi.fn(async (_p: string, _o: unknown) => ({ db: {} }) as { db?: object; error?: string });
const requestFill = vi.fn(async (_p: string, _id: string) => true);
const latestVersion = vi.fn(async () => ({ pid: "v2" }));
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
vi.mock("@/lib/projectDb", () => ({
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
}));

async function rerun(project: string, id: string) {
  const { rerunFill } = await import("@/app/p/[project]/qualify/[id]/fill-actions");
  return rerunFill(project, id);
}

beforeEach(() => {
  vi.clearAllMocks();
  actionDoor.mockResolvedValue({ db: {} });
  requestFill.mockResolvedValue(true);
});

describe("regenerating the AI card", () => {
  it("asks the filler to run again for this card, in this project", async () => {
    const state = await rerun(PROJECT_ID, "q1");
    expect(state).toEqual({ ok: true });
    expect(actionDoor).toHaveBeenCalledWith(PROJECT_ID, { write: true });
    expect(requestFill).toHaveBeenCalledWith(PROJECT_ID, "q1");
  });

  it("is refused to a caller who cannot write the project, and starts nothing", async () => {
    actionDoor.mockResolvedValue({ error: "403: you cannot change this project." });
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

  it("says so when the filler did not take the run", async () => {
    requestFill.mockResolvedValue(false);
    const state = await rerun(PROJECT_ID, "q1");
    expect(state.ok).toBe(false);
    if (!state.ok) expect(state.error).toMatch(/card agent/i);
  });
});
