import { describe, it, expect, vi } from "vitest";
import { systemForProject } from "../../scripts/seed_mcas.mjs";

// The MCAS walkthrough has to land in a project, like anything else here: a
// qualification describes one project's system, and that system is named by the
// platform so the engine's tests and the dashboard's results mean the same one.
// seedMcasVersions.test.ts pins the POST that makes the card version.
describe("naming MCAS's system on the platform", () => {
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
