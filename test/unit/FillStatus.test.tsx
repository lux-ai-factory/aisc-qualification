// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import FillStatus from "@/app/p/[project]/qualify/[id]/FillStatus";

// isolation Q1: the page passes the fill route under its project
const STATUS_URL = "/p/a1b2c3d4-0000-4000-8000-000000000002/api/qualifications/q1/fill";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  refresh.mockClear();
});

function withStates(...states: string[]) {
  let call = 0;
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ state: states[Math.min(call++, states.length - 1)] }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("the card telling you the filler is working", () => {
  it("reports a run in flight", async () => {
    withStates("running");
    await act(async () => {
      render(<FillStatus qualificationId="q1" statusUrl={STATUS_URL} />);
    });
    expect(screen.getByRole("status").textContent).toMatch(/drafting/i);
  });

  it("keeps asking while it runs", async () => {
    vi.useFakeTimers();
    const fetchMock = withStates("running", "running", "done");
    await act(async () => {
      render(<FillStatus qualificationId="q1" statusUrl={STATUS_URL} />);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refreshes the page once the run is done, so the draft appears", async () => {
    vi.useFakeTimers();
    withStates("running", "done");
    await act(async () => {
      render(<FillStatus qualificationId="q1" statusUrl={STATUS_URL} />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("stops asking once it is done", async () => {
    vi.useFakeTimers();
    const fetchMock = withStates("done");
    await act(async () => {
      render(<FillStatus qualificationId="q1" statusUrl={STATUS_URL} />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows nothing at all when no run exists for this card", async () => {
    withStates("idle");
    const { container } = render(<FillStatus qualificationId="q1" statusUrl={STATUS_URL} />);
    await act(async () => {});
    expect(container.textContent).toBe("");
  });

  it("reports a failed run", async () => {
    withStates("failed");
    await act(async () => {
      render(<FillStatus qualificationId="q1" statusUrl={STATUS_URL} />);
    });
    expect(screen.getByRole("status").textContent).toMatch(/could not|failed/i);
  });

  it("stays silent when the status cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection refused");
      }),
    );
    const { container } = render(<FillStatus qualificationId="q1" statusUrl={STATUS_URL} />);
    await act(async () => {});
    expect(container.textContent).toBe("");
    expect(refresh).not.toHaveBeenCalled();
  });
});
