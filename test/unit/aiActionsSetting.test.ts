import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiActionsOn } from "@/lib/aiActions";

// "Let AI suggest additions" exists only where the install turns AI actions on: AISC_AI_ACTIONS=on.
// Unset, or any other value, the action that starts the card agent refuses before it asks anyone, so a
// hidden button cannot be pressed by posting the action by hand.

const PROJECT = "a1b2c3d4-0000-4000-8000-000000000002";
const door = vi.fn(async () => ({ db: {} }) as { db?: object; error?: string });
const requestFill = vi.fn(async () => true);
const fillInFlight = vi.fn(async () => false);

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/projectDb", async (orig) => ({
  ...(await orig<typeof import("@/lib/projectDb")>()),
  projectDbForAction: () => door(),
}));
vi.mock("@/server/repositories/QualificationRepository", () => ({
  QualificationRepository: class {
    cardSummary = async (id: string) => ({ id });
    transaction = async () => null;
  },
}));
vi.mock("@/server/services/cardLatest", () => ({ assertLatestCard: async () => undefined }));
vi.mock("@/server/services/FillerClient", () => ({
  fillInFlight: () => fillInFlight(),
  requestFill: () => requestFill(),
}));
vi.mock("@/vendor/aisc-ledger/emit", () => ({
  emitEvent: vi.fn(async () => null),
  currentRequestId: async () => null,
}));

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe("aiActionsOn", () => {
  it.each([
    [undefined, false],
    ["", false],
    ["off", false],
    ["true", false],
    ["on", true],
    ["ON", true],
    [" on ", true],
  ])("AISC_AI_ACTIONS=%j is %s", (value, on) => {
    expect(aiActionsOn(value === undefined ? {} : { AISC_AI_ACTIONS: value })).toBe(on);
  });
});

describe("rerunFill", () => {
  it("refuses with AI actions off and asks neither the project nor the agent", async () => {
    vi.stubEnv("AISC_AI_ACTIONS", "");
    const { rerunFill } = await import("@/app/p/[project]/qualify/[id]/fill-actions");
    const out = await rerunFill(PROJECT, "c3");
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.error).toMatch(/turned off/);
    expect(door).not.toHaveBeenCalled();
    expect(requestFill).not.toHaveBeenCalled();
  });

  it("starts the agent with AI actions on", async () => {
    vi.stubEnv("AISC_AI_ACTIONS", "on");
    const { rerunFill } = await import("@/app/p/[project]/qualify/[id]/fill-actions");
    expect(await rerunFill(PROJECT, "c3")).toEqual({ ok: true });
    expect(requestFill).toHaveBeenCalled();
  });
});
