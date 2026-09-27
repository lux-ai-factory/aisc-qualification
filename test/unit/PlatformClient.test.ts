import { describe, it, expect, vi } from "vitest";
import { PlatformClient } from "@/server/services/PlatformClient";

// The AI card's versions are rows of core.system, made and numbered by the
// platform, and every module points at them: qualification describes the
// system, the engine tests it, the dashboard reports on it. This client is how
// this app asks for them. (Rewritten for WP3, pipeline 2026-09-23: the
// ai-system routes are gone; the card-version routes replace them.)
describe("PlatformClient and the project's card versions", () => {
  const latest = {
    pid: "v1", number: 1, project_id: "a1b2c3d4-0000-4000-8000-000000000002",
    name: "MCAS", version: "1.2.0", provider: null, description: null,
    created_at: "2026-09-23T10:00:00Z", created_by: null,
  };

  it("asks the platform for the project's latest version", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => latest });

    const found = await new PlatformClient("http://platform:8000", fetchImpl).latestVersion(
      "microcredit-assist-score-mcas",
    );

    expect(found?.pid).toBe("v1");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      "http://platform:8000/projects/microcredit-assist-score-mcas/system-versions/latest",
    );
    expect(init.method).toBe("GET");
  });

  it("says so rather than storing a card nobody can point at", async () => {
    // A card whose version the platform does not know cannot be joined to the
    // tests run against it, which is the whole point of naming it.
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => "no project" });

    await expect(
      new PlatformClient("http://platform:8000", fetchImpl).createVersion("nope", { name: "MCAS" }),
    ).rejects.toThrow(/could not name this system/i);
  });

  it("refuses to be configured with no platform at all", async () => {
    await expect(
      new PlatformClient("", vi.fn()).createVersion("p", { name: "MCAS" }),
    ).rejects.toThrow(/PLATFORM_URL/);
  });
});


// The platform asks who is calling: a project belongs to the people in it,
// and saving a card version takes an editor. This app makes that call on
// behalf of the person using it, so it carries their token rather than a
// credential of its own. Without this the call is anonymous and refused.
describe("PlatformClient carries the caller", () => {
  it("sends the caller's token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => null });
    const client = new PlatformClient("http://platform:8000", fetchImpl, async () => "a-token");

    await client.latestVersion("p");

    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer a-token");
  });

  it("sends no Authorization header when there is no caller", async () => {
    // A script run by hand has no session. It gets an honest 401 from the
    // platform rather than a header saying "Bearer undefined".
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => null });
    const client = new PlatformClient("http://platform:8000", fetchImpl, async () => null);

    await client.latestVersion("p");

    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it("says who was refused when the platform says no", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => '{"detail":"this takes editor on this project"}',
    });
    const client = new PlatformClient("http://platform:8000", fetchImpl, async () => "a-token");

    await expect(client.latestVersion("p")).rejects.toThrow(/403/);
  });
});
