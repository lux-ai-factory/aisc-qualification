import { describe, it, expect, vi } from "vitest";
import { requestFill } from "@/server/services/FillerClient";

// Runs are addressed by project and card (isolation Q1: /fill/{pid}/{id}).
const PID = "a1b2c3d4-0000-4000-8000-000000000002";

describe("asking the filler to run", () => {
  it("posts the project and the qualification id and does not wait for the run", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    const client = new (await import("@/server/services/FillerClient")).FillerClient(
      "http://agents:8012",
      fetchImpl as unknown as typeof fetch,
    );
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
      vi.fn().mockRejectedValue(new Error("connection refused")) as unknown as typeof fetch,
    );
    await expect(client.request(PID, "q1")).resolves.toBe(false);
  });

  it("reports a refusal as not-started rather than as success", async () => {
    const { FillerClient } = await import("@/server/services/FillerClient");
    const client = new FillerClient(
      "http://agents:8012",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch,
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
