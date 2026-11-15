// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import FillStatus from "@/app/p/[project]/qualify/[id]/FillStatus";

// A run the card saw in flight that the agents service then no longer knows (it
// restarted mid-run) is said to have been interrupted. The spinner never just
// vanishes into the idle button as if nothing had happened.

const PROJECT = "a1b2c3d4-0000-4000-8000-000000000002";
const STATUS_URL = `/p/${PROJECT}/api/qualifications/q1/fill`;

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/p/[project]/qualify/[id]/fill-actions", () => ({
  rerunFill: vi.fn(async () => ({ ok: true })),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function answers(...bodies: Array<{ state: string }>) {
  let call = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => bodies[Math.min(call++, bodies.length - 1)],
    })),
  );
}

describe("a run that the agents service lost", () => {
  it("says the AI run was interrupted when a running run becomes unknown", async () => {
    vi.useFakeTimers();
    answers({ state: "running" }, { state: "unknown" });
    await act(async () => {
      render(<FillStatus project={PROJECT} qualificationId="q1" statusUrl={STATUS_URL} />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(document.body.textContent).toMatch(/interrupted/i);
  });
});
