import { describe, it, expect, vi } from "vitest";
import { PlatformClient } from "@/server/services/PlatformClient";
import { QualificationService } from "@/server/services/QualificationService";
import { transactional } from "../support/ledgerRepo";

// Saving an AI card makes the next card version (a row of core.system, which
// the platform numbers) and then stores the card against it, so the card and
// the version stay about the same thing. Nothing is frozen: an older version
// is kept as it was because it is not the latest.

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
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "editor",
    });
    await expect(
      new PlatformClient("http://platform:8000", fetchImpl).createVersion(
        "mcas",
        { name: "MCAS" },
      ),
    ).rejects.toThrow(/could not name this system.*403/i);
  });
});

function service(opts: {
  version?: ReturnType<typeof version>;
  engine?: { components: (project: string) => Promise<unknown[]> };
}) {
  const calls: string[] = [];
  const platform = {
    createVersion: vi.fn(async () => {
      calls.push("version");
      return opts.version ?? version(2);
    }),
    // no card before this one: nothing to take along from its review
    listVersions: vi.fn(async () => []),
  };
  const repo = transactional({
    findBySystem: vi.fn(async () => null),
    create: vi.fn(async () => {
      calls.push("create");
      return { id: "card-2" };
    }),
  });
  const parser = {
    parse: () => ({
      systemName: "MCAS",
      systemVersion: "1.3",
      company: "LIST",
      description: "Scores loans",
      targetUseCase: "",
      targetUsers: "",
      intendedDeployers: "",
      targetSystemTags: [],
      sectorTags: [],
      marketFormTags: [],
      localityTags: [],
      answers: [],
      risks: [],
    }),
  };
  // the service only uses these methods of its collaborators
  const engine = opts.engine ?? { components: vi.fn(async () => []) };
  const svc = new QualificationService(
    repo as never,
    parser as never,
    platform as never,
    undefined,
    undefined,
    engine as never,
  );
  return { svc, platform, repo, calls };
}

describe("submitting an AI card", () => {
  it("stores the card against the version it made", async () => {
    const { svc, repo, calls } = service({});
    // The card's id only; the platform pid it once returned for the filler has no reader
    expect(await svc.createFromForm("mcas", new FormData())).toEqual({
      id: "card-2",
    });
    expect(calls).toEqual(["version", "create"]);
    // the card is written into its project's own database and names no project
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ systemId: "v2" }),
    );
    expect((repo.create.mock.calls[0] as unknown[])[0]).not.toHaveProperty(
      "projectId",
    );
  });
});

describe("the engine components a save links", () => {
  const scorer = {
    pid: "c0c0c0c0-0000-4000-8000-000000000001",
    name: "Scorer",
    component_type: "model",
    data: "models/m.pkl",
  };

  it("every save writes the card's links to the engine's components, with their snapshot", async () => {
    const components = vi.fn(async () => [scorer]);
    const { svc, repo } = service({ engine: { components } });
    await svc.createFromForm("mcas", new FormData());
    expect(components).toHaveBeenCalledWith("mcas");
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        engineLinks: [
          {
            componentPid: scorer.pid,
            airoProperty: "hasModel",
            name: "Scorer",
            componentType: "model",
            objectName: "models/m.pkl",
            componentKey: null,
          },
        ],
      }),
    );
  });

  it("an engine that does not answer does not stop the save: the card links nothing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { svc, repo } = service({
      engine: {
        components: async () => {
          throw new Error("The engine did not answer");
        },
      },
    });
    expect(await svc.createFromForm("mcas", new FormData())).toEqual({ id: "card-2" });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ engineLinks: [] }));
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/engine/i));
    warn.mockRestore();
  });
});
