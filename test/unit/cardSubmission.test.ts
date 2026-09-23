import { describe, it, expect, vi } from "vitest";
import { PlatformClient } from "@/server/services/PlatformClient";
import { QualificationService, CardExistsError } from "@/server/services/QualificationService";

// Submitting an AI card describes one version of the project's AI system and
// freezes it: the card and the version stay about the same thing. The platform
// hands out the version (the draft, or the next one after a frozen latest), the
// system's identity is set from the form, then it is frozen, then the card is
// stored against it. One card per version, whatever else happens.

const version = (number: number, frozen = false) => ({
  pid: `v${number}`,
  number,
  project_id: "core-project-1",
  frozen_at: frozen ? "2026-09-23T15:00:00Z" : null,
});

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => "" };
}

describe("PlatformClient and the AI system's versions", () => {
  it("asks for a draft, then sets the system's identity on it", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ version: version(2), forked_from: "v1" }))
      .mockResolvedValueOnce(jsonResponse({ version: { ...version(2), name: "MCAS" }, forked_from: null }));
    const client = new PlatformClient("http://platform:8000", fetchImpl, async () => "tok");

    const found = await client.versionForNewCard("mcas", {
      name: "MCAS", version: "1.3", provider: "LIST", description: "Scores loans",
    });

    expect(found.pid).toBe("v2");
    const [draftUrl, draftInit] = fetchImpl.mock.calls[0];
    expect(draftUrl).toBe("http://platform:8000/projects/mcas/ai-system/draft");
    expect(draftInit.method).toBe("POST");
    expect(draftInit.headers.Authorization).toBe("Bearer tok");
    const [editUrl, editInit] = fetchImpl.mock.calls[1];
    expect(editUrl).toBe("http://platform:8000/projects/mcas/ai-system");
    expect(editInit.method).toBe("PATCH");
    expect(JSON.parse(editInit.body)).toEqual({
      name: "MCAS", release: "1.3", provider: "LIST", description: "Scores loans",
    });
  });

  it("freezes a version for a reason", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(version(2, true)));
    await new PlatformClient("http://platform:8000", fetchImpl).freeze("v2", "ai card");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://platform:8000/ai-system-versions/v2/freeze");
    expect(JSON.parse(init.body)).toEqual({ reason: "ai card" });
  });

  it("says so when the platform will not", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "editor" });
    await expect(
      new PlatformClient("http://platform:8000", fetchImpl).freeze("v2", "ai card"),
    ).rejects.toThrow(/could not name this system.*403/i);
  });
});

function service(opts: { existing?: { id: string } | null; version?: ReturnType<typeof version> }) {
  const calls: string[] = [];
  const platform = {
    versionForNewCard: vi.fn(async () => {
      calls.push("version");
      return opts.version ?? version(2);
    }),
    freeze: vi.fn(async () => {
      calls.push("freeze");
      return version(2, true);
    }),
  };
  const repo = {
    findBySystem: vi.fn(async () => opts.existing ?? null),
    create: vi.fn(async () => {
      calls.push("create");
      return { id: "card-2" };
    }),
  };
  const parser = {
    parse: () => ({
      systemName: "MCAS", systemVersion: "1.3", company: "LIST", description: "Scores loans",
      targetUseCase: "", targetUsers: "", intendedDeployers: "", targetSystemTags: [],
      sectorTags: [], marketFormTags: [], localityTags: [], answers: [], risks: [],
    }),
  };
  // the service only uses these methods of its collaborators
  const svc = new QualificationService(repo as never, parser as never, platform as never);
  return { svc, platform, repo, calls };
}

describe("submitting an AI card", () => {
  it("stores the card against the version, after freezing it", async () => {
    const { svc, repo, platform, calls } = service({});
    const { id } = await svc.createFromForm("mcas", new FormData());
    expect(id).toBe("card-2");
    expect(calls).toEqual(["version", "freeze", "create"]);
    expect(platform.freeze).toHaveBeenCalledWith("v2", "ai card");
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ systemId: "v2", projectId: "core-project-1" }),
    );
  });

  it("never stores a second card for a version", async () => {
    const { svc, repo, platform } = service({ existing: { id: "card-1" } });
    await expect(svc.createFromForm("mcas", new FormData())).rejects.toBeInstanceOf(CardExistsError);
    expect(repo.create).not.toHaveBeenCalled();
    expect(platform.freeze).not.toHaveBeenCalled();
  });
});
