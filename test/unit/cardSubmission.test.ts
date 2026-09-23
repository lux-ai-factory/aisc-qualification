import { describe, it, expect, vi } from "vitest";
import { PlatformClient } from "@/server/services/PlatformClient";
import { QualificationService } from "@/server/services/QualificationService";

// Saving an AI card makes the next card version (a row of core.system, which
// the platform numbers) and then stores the card against it, so the card and
// the version stay about the same thing. Nothing is frozen: an older version
// is kept as it was because it is not the latest.
// (Rewritten for WP3, pipeline 2026-09-23: the draft, freeze and one-card-
// per-version refusal cases were about behaviour that is gone.)

const version = (number: number) => ({
  pid: `v${number}`,
  number,
  project_id: "core-project-1",
  name: "MCAS",
  version: "1.3",
  provider: null,
  description: null,
  created_at: "2026-09-23T15:00:00Z",
  created_by: null,
});

describe("PlatformClient and the card versions", () => {
  it("says so when the platform will not", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "editor" });
    await expect(
      new PlatformClient("http://platform:8000", fetchImpl).createVersion("mcas", { name: "MCAS" }),
    ).rejects.toThrow(/could not name this system.*403/i);
  });
});

function service(opts: { version?: ReturnType<typeof version> }) {
  const calls: string[] = [];
  const platform = {
    createVersion: vi.fn(async () => {
      calls.push("version");
      return opts.version ?? version(2);
    }),
  };
  const repo = {
    findBySystem: vi.fn(async () => null),
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
  it("stores the card against the version it made", async () => {
    const { svc, repo, calls } = service({});
    const { id } = await svc.createFromForm("mcas", new FormData());
    expect(id).toBe("card-2");
    expect(calls).toEqual(["version", "create"]);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ systemId: "v2", projectId: "core-project-1" }),
    );
  });
});
