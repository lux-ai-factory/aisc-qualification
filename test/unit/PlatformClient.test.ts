import { describe, it, expect, vi } from "vitest";
import { PlatformClient } from "@/server/services/PlatformClient";

// The system under assessment is named once, by the platform, and every module
// points at that one name: qualification describes the system, the engine tests
// it, the dashboard reports on it. This client is how this app asks for it.
describe("PlatformClient.registerSystem", () => {
  const system = {
    pid: "f0b4a2c0-0000-4000-8000-000000000001",
    project_id: "a1b2c3d4-0000-4000-8000-000000000002",
    name: "MCAS",
    version: "1.2.0",
  };

  it("asks the platform for the system inside the project", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => system,
    });

    const found = await new PlatformClient("http://platform:8000", fetchImpl).registerSystem(
      "microcredit-assist-score-mcas",
      { name: "MCAS", version: "1.2.0" },
    );

    expect(found.pid).toBe(system.pid);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://platform:8000/projects/microcredit-assist-score-mcas/systems");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ name: "MCAS", version: "1.2.0" });
  });

  it("registering the same system twice is the same system", async () => {
    // The platform makes it once and returns it thereafter, so this client has
    // nothing to remember and callers can name their system every time.
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => system });
    const client = new PlatformClient("http://platform:8000", fetchImpl);

    const first = await client.registerSystem("p", { name: "MCAS", version: "1.2.0" });
    const again = await client.registerSystem("p", { name: "MCAS", version: "1.2.0" });

    expect(again.pid).toBe(first.pid);
  });

  it("says so rather than storing a system nobody can point at", async () => {
    // A qualification whose system the platform does not know cannot be joined
    // to the tests run against it, which is the whole point of naming it.
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => "no project" });

    await expect(
      new PlatformClient("http://platform:8000", fetchImpl).registerSystem("nope", { name: "MCAS" }),
    ).rejects.toThrow(/could not name this system/i);
  });

  it("refuses to be configured with no platform at all", async () => {
    await expect(
      new PlatformClient("", vi.fn()).registerSystem("p", { name: "MCAS" }),
    ).rejects.toThrow(/PLATFORM_URL/);
  });
});

// Opened without a project, this app has nothing to show: a qualification is of
// one project's system. Rather than a dead end, the page offers the projects,
// which it reads from the platform.
describe("PlatformClient.projects", () => {
  const projects = [
    { pid: "a1", name: "MCAS", slug: "mcas", description: "First" },
    { pid: "b2", name: "Other", slug: "other", description: null },
  ];

  it("lists what the platform has", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => projects });

    const found = await new PlatformClient("http://platform:8000", fetchImpl).projects();

    expect(found.map((p) => p.pid)).toEqual(["a1", "b2"]);
    expect(fetchImpl.mock.calls[0][0]).toBe("http://platform:8000/projects");
  });

  it("shows an empty list rather than an error page when the platform is down", async () => {
    // The methodology and the rest of the app still read; only the chooser is
    // empty, and it says so on the page.
    const fetchImpl = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));

    expect(await new PlatformClient("http://platform:8000", fetchImpl).projects()).toEqual([]);
  });

  it("is empty when no platform is configured at all", async () => {
    expect(await new PlatformClient("", vi.fn()).projects()).toEqual([]);
  });
});
