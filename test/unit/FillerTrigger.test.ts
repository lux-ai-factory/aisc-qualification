import { describe, it, expect, vi } from "vitest";
import { requestFill } from "@/server/services/FillerClient";

// Runs are addressed by project and card (/fill/{pid}/{id}).
const PID = "a1b2c3d4-0000-4000-8000-000000000002";

describe("asking the filler to run", () => {
  it("posts the project and the qualification id and does not wait for the run", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    const client = new (
      await import("@/server/services/FillerClient")
    ).FillerClient("http://agents:8012", fetchImpl as unknown as typeof fetch);
    await client.request(PID, "q1");
    expect(fetchImpl).toHaveBeenCalledWith(
      `http://agents:8012/fill/${PID}/q1`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("does not fail the save when the filler is unreachable", async () => {
    // The qualification is already stored by this point. A filler that is down
    // must cost the user their draft, not their submission.
    const { FillerClient } = await import("@/server/services/FillerClient");
    const client = new FillerClient(
      "http://agents:8012",
      vi
        .fn()
        .mockRejectedValue(
          new Error("connection refused"),
        ) as unknown as typeof fetch,
    );
    await expect(client.request(PID, "q1")).resolves.toBe(false);
  });

  it("reports a refusal as not-started rather than as success", async () => {
    const { FillerClient } = await import("@/server/services/FillerClient");
    const client = new FillerClient(
      "http://agents:8012",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }) as unknown as typeof fetch,
    );
    expect(await client.request(PID, "q1")).toBe(false);
  });

  it("does nothing at all when no filler is configured", async () => {
    // No AGENT_SERVICE_URL means the deployment has no filler. That is a
    // configuration, not an error: the card still builds from the form.
    const fetchImpl = vi.fn();
    const { FillerClient } = await import("@/server/services/FillerClient");
    const client = new FillerClient("", fetchImpl as unknown as typeof fetch);
    expect(await client.request(PID, "q1")).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("is a module-level helper the action can call in one line", () => {
    expect(typeof requestFill).toBe("function");
  });
});

describe("whether a run is in flight (code review B5)", () => {
  const status = (state: string | null, ok = true) =>
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 404,
      json: async () => ({ state }),
    });

  it("is true for a queued or running run, asked with GET on the run's address", async () => {
    const { FillerClient } = await import("@/server/services/FillerClient");
    for (const state of ["queued", "running"]) {
      const fetchImpl = status(state);
      expect(
        await new FillerClient(
          "http://agents:8012",
          fetchImpl as never,
        ).inFlight(PID, "q1"),
      ).toBe(true);
      expect(fetchImpl).toHaveBeenCalledWith(
        `http://agents:8012/fill/${PID}/q1`,
        expect.objectContaining({ method: "GET" }),
      );
    }
  });

  it("is false for a finished run, no run, or a filler that does not answer", async () => {
    const { FillerClient } = await import("@/server/services/FillerClient");
    expect(
      await new FillerClient(
        "http://agents:8012",
        status("done") as never,
      ).inFlight(PID, "q1"),
    ).toBe(false);
    expect(
      await new FillerClient(
        "http://agents:8012",
        status(null, false) as never,
      ).inFlight(PID, "q1"),
    ).toBe(false);
    const down = vi.fn().mockRejectedValue(new Error("refused"));
    expect(
      await new FillerClient("http://agents:8012", down as never).inFlight(
        PID,
        "q1",
      ),
    ).toBe(false);
  });
});
