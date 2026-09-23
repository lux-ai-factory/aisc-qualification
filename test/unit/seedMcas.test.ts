import { describe, it, expect, vi } from "vitest";
import { freezeForCard, systemForProject } from "../../scripts/seed_mcas.mjs";

// The MCAS walkthrough has to land in a project, like anything else here: a
// qualification describes one project's system, and that system is named by the
// platform so the engine's tests and the dashboard's results mean the same one.
describe("naming MCAS's system on the platform", () => {
  const system = {
    pid: "5f1b0000-0000-4000-8000-000000000001",
    project_id: "01399e17-4b01-4be9-997a-7f5e3574ab22",
  };

  it("asks for a version to describe, and sets MCAS's identity on it", async () => {
    // one AI card per version: the seeded card describes a version with none yet
    const version = { pid: system.pid, number: 1, project_id: system.project_id };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ version, forked_from: null }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ version, forked_from: null }) });

    const found = await systemForProject("mcas", {
      platformUrl: "http://platform:8000",
      fetchImpl,
    });

    expect(found).toEqual({ projectId: system.project_id, systemId: system.pid });
    expect(fetchImpl.mock.calls[0][0]).toBe("http://platform:8000/projects/mcas/ai-system/draft");
    const [url, init] = fetchImpl.mock.calls[1];
    expect(url).toBe("http://platform:8000/projects/mcas/ai-system");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({
      name: "MicroCredit Assist Score (MCAS)",
      release: "v1.2.0",
      provider: "Creditum AI SARL (Luxembourg)",
    });
  });

  it("freezes the version once its card is stored", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    await freezeForCard(system.pid, { platformUrl: "http://platform:8000", fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`http://platform:8000/ai-system-versions/${system.pid}/freeze`);
    expect(JSON.parse(init.body)).toEqual({ reason: "ai card" });
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
