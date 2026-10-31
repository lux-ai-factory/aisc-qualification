// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import FillStatus from "@/app/p/[project]/qualify/[id]/FillStatus";

// the page passes the fill route under its project
const STATUS_URL =
  "/p/a1b2c3d4-0000-4000-8000-000000000002/api/qualifications/q1/fill";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const rerunFill = vi.fn(
  async (_p: string, _id: string) =>
    ({ ok: true }) as { ok: boolean; error?: string },
);
vi.mock("@/app/p/[project]/qualify/[id]/fill-actions", () => ({
  rerunFill: (p: string, id: string) => rerunFill(p, id),
}));
const PROJECT = "a1b2c3d4-0000-4000-8000-000000000002";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  refresh.mockClear();
  rerunFill.mockClear();
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
      render(
        <FillStatus
          project={PROJECT}
          qualificationId="q1"
          statusUrl={STATUS_URL}
        />,
      );
    });
    expect(screen.getByRole("status").textContent).toMatch(
      /suggesting additions/i,
    );
  });

  it("keeps asking while it runs", async () => {
    vi.useFakeTimers();
    const fetchMock = withStates("running", "running", "done");
    await act(async () => {
      render(
        <FillStatus
          project={PROJECT}
          qualificationId="q1"
          statusUrl={STATUS_URL}
        />,
      );
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
      render(
        <FillStatus
          project={PROJECT}
          qualificationId="q1"
          statusUrl={STATUS_URL}
        />,
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  // The agent keeps a finished run's "done" until it restarts, so every open of
  // the card after a run, even days later, saw "done" on its first poll and refreshed the page,
  // rendering it twice and recording a second qualification.opened. Only a run this mount saw in
  // flight is brought in.
  it("does not refresh when the first look already finds a run done (an earlier run)", async () => {
    vi.useFakeTimers();
    withStates("done");
    await act(async () => {
      render(
        <FillStatus
          project={PROJECT}
          qualificationId="q1"
          statusUrl={STATUS_URL}
        />,
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("stops asking once it is done", async () => {
    vi.useFakeTimers();
    const fetchMock = withStates("done");
    await act(async () => {
      render(
        <FillStatus
          project={PROJECT}
          qualificationId="q1"
          statusUrl={STATUS_URL}
        />,
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows no status line when no run exists for this card", async () => {
    withStates("idle");
    render(
      <FillStatus
        project={PROJECT}
        qualificationId="q1"
        statusUrl={STATUS_URL}
      />,
    );
    await act(async () => {});
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("reports a failed run", async () => {
    withStates("failed");
    await act(async () => {
      render(
        <FillStatus
          project={PROJECT}
          qualificationId="q1"
          statusUrl={STATUS_URL}
        />,
      );
    });
    expect(screen.getByRole("status").textContent).toMatch(/could not|failed/i);
  });

  it("shows the run's error text when the route gives it (to editors)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ state: "failed", run: 3, error: "provider answered 401: invalid key" }),
      })),
    );
    await act(async () => {
      render(<FillStatus project={PROJECT} qualificationId="q1" statusUrl={STATUS_URL} />);
    });
    expect(screen.getByRole("status").textContent).toContain("provider answered 401: invalid key");
  });

  it("keeps asking after a failed look while a run is in flight", async () => {
    vi.useFakeTimers();
    let call = 0;
    const answers = [
      { ok: true, json: async () => ({ state: "running" }) },
      { ok: false, status: 502, json: async () => ({}) },
      "throw",
      { ok: true, json: async () => ({ state: "done" }) },
    ];
    const fetchMock = vi.fn(async () => {
      const next = answers[Math.min(call++, answers.length - 1)];
      if (next === "throw") throw new TypeError("Failed to fetch");
      return next;
    });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => {
      render(<FillStatus project={PROJECT} qualificationId="q1" statusUrl={STATUS_URL} />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not keep asking after a failed first look: no run is known", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => {
      render(<FillStatus project={PROJECT} qualificationId="q1" statusUrl={STATUS_URL} />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stays silent when the status cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection refused");
      }),
    );
    render(
      <FillStatus
        project={PROJECT}
        qualificationId="q1"
        statusUrl={STATUS_URL}
      />,
    );
    await act(async () => {});
    expect(screen.queryByRole("status")).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("refining the card with AI from its page", () => {
  const button = () =>
    screen.queryByRole("button", { name: /let ai suggest additions/i });

  it.each(["idle", "done", "failed"])(
    "offers to refine with AI when the run is %s",
    async (state) => {
      withStates(state);
      await act(async () => {
        render(
          <FillStatus
            project={PROJECT}
            qualificationId="q1"
            statusUrl={STATUS_URL}
          />,
        );
      });
      expect(button()).not.toBeNull();
    },
  );

  it.each(["queued", "running"])(
    "does not offer it while a run is %s",
    async (state) => {
      withStates(state);
      await act(async () => {
        render(
          <FillStatus
            project={PROJECT}
            qualificationId="q1"
            statusUrl={STATUS_URL}
          />,
        );
      });
      expect(button()).toBeNull();
    },
  );

  it("starts a run, shows it in flight, and refreshes the page again when it lands", async () => {
    vi.useFakeTimers();
    // first look: an earlier run is done (no refresh); after the click: running, then done
    withStates("done", "running", "done");
    await act(async () => {
      render(
        <FillStatus
          project={PROJECT}
          qualificationId="q1"
          statusUrl={STATUS_URL}
        />,
      );
    });
    expect(refresh).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(button()!);
    });
    expect(rerunFill).toHaveBeenCalledWith(PROJECT, "q1");
    expect(screen.getByRole("status").textContent).toMatch(
      /suggesting additions/i,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows why when the run could not be started", async () => {
    withStates("idle");
    rerunFill.mockResolvedValueOnce({
      ok: false,
      error: "The card agent did not take the run.",
    });
    await act(async () => {
      render(
        <FillStatus
          project={PROJECT}
          qualificationId="q1"
          statusUrl={STATUS_URL}
        />,
      );
    });
    await act(async () => {
      fireEvent.click(button()!);
    });
    expect(screen.getByRole("alert").textContent).toMatch(/card agent/i);
    expect(button()).not.toBeNull();
  });
});

describe("the card counting the places to check", () => {
  // The count is the card's own (its nodes carrying notes), so it survives a restart of the
  // agent and drops a note a reviewer's edit settled; the run's record is not read for it.
  async function withPlaces(
    places: number,
    state = "done",
    result: unknown = undefined,
  ) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ state, result }) })),
    );
    await act(async () => {
      render(
        <FillStatus
          project={PROJECT}
          qualificationId="q1"
          statusUrl={STATUS_URL}
          places={places}
        />,
      );
    });
  }

  it("says how many places to check", async () => {
    await withPlaces(2);
    expect(screen.getByText("2 items to review")).toBeTruthy();
  });

  it("says place, not places, for one", async () => {
    await withPlaces(1);
    expect(screen.getByText("1 item to review")).toBeTruthy();
  });

  it("still says it when the agent has no run to report, after a restart", async () => {
    await withPlaces(3, "idle");
    expect(screen.getByText("3 items to review")).toBeTruthy();
  });

  it("goes by the card, not by the count a past run recorded", async () => {
    await withPlaces(0, "done", { notes: 2 });
    expect(screen.queryByText(/to check/)).toBeNull();
  });

  it("says nothing while a run is in flight", async () => {
    await withPlaces(2, "running");
    expect(screen.queryByText(/to check/)).toBeNull();
  });
});
