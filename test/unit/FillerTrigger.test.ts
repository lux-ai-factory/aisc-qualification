import { describe, it, expect, vi } from "vitest";
import { requestFill } from "@/server/services/FillerClient";

describe("asking the filler to run", () => {
  it("posts the qualification id and does not wait for the run", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    const client = new (await import("@/server/services/FillerClient")).FillerClient(
      "http://agents:8012",
      fetchImpl as unknown as typeof fetch,
    );
    await client.request("q1");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://agents:8012/fill/q1",
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
    await expect(client.request("q1")).resolves.toBe(false);
  });

  it("reports a refusal as not-started rather than as success", async () => {
    const { FillerClient } = await import("@/server/services/FillerClient");
    const client = new FillerClient(
      "http://agents:8012",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch,
    );
    expect(await client.request("q1")).toBe(false);
  });

  it("does nothing at all when no filler is configured", async () => {
    // No AGENT_SERVICE_URL means the deployment has no filler. That is a
    // configuration, not an error: the card still builds from the form.
    const fetchImpl = vi.fn();
    const { FillerClient } = await import("@/server/services/FillerClient");
    const client = new FillerClient("", fetchImpl as unknown as typeof fetch);
    expect(await client.request("q1")).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("is a module-level helper the action can call in one line", () => {
    expect(typeof requestFill).toBe("function");
  });
});

// LLM keys pipeline (2026-09-24), 01-specs.md S3.8: the filler is told which project it works
// for, so it can use that project's model and key. The second argument does not exist yet, so
// the client is reached through `loose` to keep tsc clean while the test fails at run time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const looseClient = (x: unknown) => x as any;

describe("S3.8 the filler is told the project", () => {
  const PID = "a1b2c3d4-0000-4000-8000-000000000002";

  it("S3.8 posts ?project=<pid> when a project id is given", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    const { FillerClient } = await import("@/server/services/FillerClient");
    const client = looseClient(new FillerClient("http://agents:8012", fetchImpl as unknown as typeof fetch));
    expect(await client.request("q1", PID)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      `http://agents:8012/fill/q1?project=${encodeURIComponent(PID)}`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("S3.8 encodes the project id", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    const { FillerClient } = await import("@/server/services/FillerClient");
    const client = looseClient(new FillerClient("http://agents:8012", fetchImpl as unknown as typeof fetch));
    await client.request("q1", "a b&c");
    expect(fetchImpl.mock.calls[0][0]).toBe("http://agents:8012/fill/q1?project=a%20b%26c");
  });

  it("S3.8 still never throws, reports refusals, and makes no call without a URL", async () => {
    const { FillerClient } = await import("@/server/services/FillerClient");
    const down = looseClient(new FillerClient(
      "http://agents:8012",
      vi.fn().mockRejectedValue(new Error("connection refused")) as unknown as typeof fetch,
    ));
    await expect(down.request("q1", PID)).resolves.toBe(false);
    const refused = looseClient(new FillerClient(
      "http://agents:8012",
      vi.fn().mockResolvedValue({ ok: false, status: 422 }) as unknown as typeof fetch,
    ));
    expect(await refused.request("q1", PID)).toBe(false);
    const fetchImpl = vi.fn();
    const none = looseClient(new FillerClient("", fetchImpl as unknown as typeof fetch));
    expect(await none.request("q1", PID)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("S3.8 requestFill passes the project id through", async () => {
    vi.resetModules();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal("fetch", fetchImpl);
    vi.stubEnv("AGENT_SERVICE_URL", "http://agents:8012");
    try {
      const mod = looseClient(await import("@/server/services/FillerClient"));
      await mod.requestFill("q1", PID);
      expect(fetchImpl.mock.calls[0][0]).toBe(`http://agents:8012/fill/q1?project=${PID}`);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
