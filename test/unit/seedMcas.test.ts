import { describe, it, expect, vi } from "vitest";
// @ts-expect-error - the seed is plain JS, run by node on a fresh install
import { systemForProject } from "../../scripts/seed_mcas.mjs";

// The MCAS walkthrough has to land in a project, like anything else here: a
// qualification describes one project's system, and that system is named by the
// platform so the engine's tests and the dashboard's results mean the same one.
describe("naming MCAS's system on the platform", () => {
  const system = {
    pid: "5f1b0000-0000-4000-8000-000000000001",
    project_id: "01399e17-4b01-4be9-997a-7f5e3574ab22",
  };

  it("registers the system of the project it was given", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => system });

    const found = await systemForProject("mcas", {
      platformUrl: "http://platform:8000",
      fetchImpl,
    });

    expect(found).toEqual({ projectId: system.project_id, systemId: system.pid });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://platform:8000/projects/mcas/systems");
    expect(JSON.parse(init.body)).toEqual({
      name: "MicroCredit Assist Score (MCAS)",
      version: "v1.2.0",
      provider: "Creditum AI SARL (Luxembourg)",
    });
  });

  it("will not seed into no project at all", async () => {
    await expect(
      systemForProject("", { platformUrl: "http://platform:8000", fetchImpl: vi.fn() }),
    ).rejects.toThrow(/which project/i);
  });

  it("says so when the platform does not know that project", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => '{"detail":"no project'  + "'nope'" + '"}',
    });

    await expect(
      systemForProject("nope", { platformUrl: "http://platform:8000", fetchImpl }),
    ).rejects.toThrow(/could not name MCAS's system/i);
  });

  it("needs to know where the platform is", async () => {
    await expect(
      systemForProject("mcas", { platformUrl: "", fetchImpl: vi.fn() }),
    ).rejects.toThrow(/PLATFORM_URL/);
  });
});
