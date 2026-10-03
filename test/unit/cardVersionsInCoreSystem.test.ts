import { describe, it, expect, vi } from "vitest";
import { PlatformClient } from "@/server/services/PlatformClient";
import { QualificationService } from "@/server/services/QualificationService";
import * as cardVersions from "@/domain/cardVersions";
import { transactional } from "../support/ledgerRepo";

// WP3 (pipeline 2026-09-23). The project has one AI system, not versioned;
// only its AI card is. Saving the card makes the next card version, a row of
// core.system (the platform's `/system-versions` routes), and the card points
// at it. Nothing is frozen: old versions are read-only because they are not
// the latest, which the database enforces.
//
// Written before the implementation. Methods that do not exist yet are reached
// through `loose` so tsc stays clean while the tests fail at run time.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loose = (x: unknown) => x as any;

const PROJECT_ID = "a1b2c3d4-0000-4000-8000-000000000002";
const row = (number: number) => ({
  pid: `v${number}`,
  project_id: PROJECT_ID,
  number,
  name: "MCAS",
  version: "1.2.0",
  provider: "LIST",
  description: "Scores loans",
  created_at: `2026-09-23T1${number}:00:00Z`,
  created_by: "user-1",
});

function ok(body: unknown, status = 200) {
  return { ok: true, status, json: async () => body, text: async () => JSON.stringify(body) };
}

describe("PlatformClient over the card-version routes (WP2 interfaces)", () => {
  it("S3.1 createVersion POSTs the identity to /projects/{project}/system-versions", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok(row(1), 201));
    const client = loose(new PlatformClient("http://platform:8000", fetchImpl, async () => "tok"));

    const made = await client.createVersion("mcas", {
      name: "MCAS", version: "1.2.0", provider: "LIST", description: "Scores loans",
    });

    expect(made).toMatchObject({ pid: "v1", number: 1, project_id: PROJECT_ID });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://platform:8000/projects/mcas/system-versions");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({
      name: "MCAS", version: "1.2.0", provider: "LIST", description: "Scores loans",
    });
  });

  it("S3.1 listVersions GETs /projects/{project}/system-versions", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok([row(2), row(1)]));
    const client = loose(new PlatformClient("http://platform:8000", fetchImpl));

    const list = await client.listVersions("mcas");

    expect(list.map((v: { number: number }) => v.number)).toEqual([2, 1]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://platform:8000/projects/mcas/system-versions");
    expect(init.method).toBe("GET");
  });

  it("S3.1 latestVersion GETs .../system-versions/latest, and null when there is none", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok(row(2)))
      .mockResolvedValueOnce(ok(null));
    const client = loose(new PlatformClient("http://platform:8000", fetchImpl));

    expect((await client.latestVersion("mcas")).pid).toBe("v2");
    expect(await client.latestVersion("mcas")).toBeNull();
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "http://platform:8000/projects/mcas/system-versions/latest",
    );
  });

  it("S3.1 the freeze-era methods are gone", () => {
    const client = loose(new PlatformClient("http://platform:8000", vi.fn()));
    expect(client.aiSystem).toBeUndefined();
    expect(client.versionForNewCard).toBeUndefined();
    expect(client.freeze).toBeUndefined();
  });

  it("S3.6 an unreachable platform is reported, not swallowed", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const client = loose(new PlatformClient("http://platform:8000", fetchImpl));
    await expect(client.createVersion("mcas", { name: "MCAS" })).rejects.toThrow(
      /did not answer/i,
    );
  });
});

describe("cardVersions with {pid, number} rows (no frozen_at)", () => {
  const v = (number: number) => ({ pid: `v${number}`, number });

  it("S3.1 the next card is always the version after the latest", () => {
    expect(loose(cardVersions).nextCard([v(1)], [{ id: "c1", systemId: "v1" }])).toEqual({
      versionNumber: 2, fromCardId: "c1", fromVersionNumber: 1,
    });
    expect(loose(cardVersions).nextCard([], [])).toEqual({
      versionNumber: 1, fromCardId: null, fromVersionNumber: null,
    });
  });

  it("S3.1 a latest version left without a card (a failed save) is skipped: the next save makes vN+1", () => {
    // WP3 code note: versions are never deleted, so v2 stays card-less
    const next = loose(cardVersions).nextCard([v(2), v(1)], [{ id: "c1", systemId: "v1" }]);
    expect(next).toEqual({ versionNumber: 3, fromCardId: "c1", fromVersionNumber: 1 });
  });

  it("S3.3 only the latest version's card is current; an older one is not, even when the latest has no card", () => {
    const cards = [{ id: "c1", systemId: "v1" }, { id: "c2", systemId: "v2" }];
    expect(loose(cardVersions).cardStanding([v(2), v(1)], cards, "v1").current).toBe(false);
    expect(loose(cardVersions).cardStanding([v(2), v(1)], cards, "v2").current).toBe(true);
    expect(
      loose(cardVersions).cardStanding([v(2), v(1)], [{ id: "c1", systemId: "v1" }], "v1").current,
    ).toBe(false);
  });

  it("S3.1 the domain no longer mentions frozen versions", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("src/domain/cardVersions.ts", "utf8")).not.toMatch(/frozen/i);
  });
});

const PARSED = {
  systemName: "MCAS", systemVersion: "1.3", company: "LIST", description: "Scores loans",
  targetUseCase: "", targetUsers: "", intendedDeployers: "", targetSystemTags: ["t"],
  sectorTags: ["s"], marketFormTags: ["software"], localityTags: [], answers: [], risks: [],
};

function service(opts: { platformDown?: boolean; versions?: ReturnType<typeof row>[]; cards?: unknown[] } = {}) {
  const calls: string[] = [];
  let made = (opts.versions ?? []).length;
  const platform = {
    createVersion: vi.fn(async () => {
      calls.push("createVersion");
      if (opts.platformDown) throw new Error("Could not name this system: the platform did not answer.");
      made += 1;
      return row(made);
    }),
    latestVersion: vi.fn(async () => (opts.versions ?? [])[0] ?? null),
    listVersions: vi.fn(async () => opts.versions ?? []),
    // present only so a leftover call is visible, not silently undefined
    versionForNewCard: vi.fn(async () => { calls.push("versionForNewCard"); return row(1); }),
    freeze: vi.fn(async () => { calls.push("freeze"); return row(1); }),
    aiSystem: vi.fn(async () => { calls.push("aiSystem"); return null; }),
  };
  const created: Record<string, unknown>[] = [];
  const repo = transactional({
    findBySystem: vi.fn(async () => null),
    list: vi.fn(async () => opts.cards ?? []),
    create: vi.fn(async (input: Record<string, unknown>) => {
      calls.push("create");
      created.push(input);
      return { id: `card-${created.length}` };
    }),
  });
  const parser = { parse: () => PARSED };
  const svc = new QualificationService(repo as never, parser as never, platform as never);
  return { svc, platform, repo, calls, created };
}

describe("save = next version (QualificationService.createFromForm)", () => {
  it("S3.1 each save makes one core.system version, then the card pointing at it; nothing is frozen", async () => {
    const { svc, platform, calls, created } = service();

    await svc.createFromForm("mcas", new FormData());
    await svc.createFromForm("mcas", new FormData());

    expect(calls).toEqual(["createVersion", "create", "createVersion", "create"]);
    expect(platform.createVersion).toHaveBeenCalledWith("mcas", {
      name: "MCAS", version: "1.3", provider: "LIST", description: "Scores loans",
    });
    expect(created.map((c) => c.systemId)).toEqual(["v1", "v2"]);
    // isolation Q1: the card goes into its project's own database and names no project
    expect(created.every((c) => !("projectId" in c))).toBe(true);
  });

  it("S3.1 CardExistsError is gone", async () => {
    const mod = loose(await import("@/server/services/QualificationService"));
    expect(mod.CardExistsError).toBeUndefined();
  });

  it("S3.6 when the platform is unreachable, nothing is stored", async () => {
    const { svc, repo } = service({ platformDown: true });
    await expect(svc.createFromForm("mcas", new FormData())).rejects.toThrow(/did not answer/i);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("S3.2 the second save starts from the first card: answers, tags and risks in order", async () => {
    const first = {
      id: "c1", systemId: "v1", projectId: PROJECT_ID,
      systemName: "MCAS", systemVersion: "1.2.0", company: "LIST", description: "Scores loans",
      targetUseCase: "u", targetUsers: "t", intendedDeployers: null,
      targetSystemTags: ["tabular"], sectorTags: ["finance"], marketFormTags: ["software"],
      localityTags: ["workplace"],
      answers: [{ toolId: "annex-1", questionId: "1a", answer: "A" }],
      risks: [
        { position: 1, risk: "Second", source: "s", vulnerability: null, consequence: "c",
          affected: "user", impactAreas: [], control: "k", followUpControl: null },
        { position: 0, risk: "First", source: "s", vulnerability: null, consequence: "c",
          affected: "user", impactAreas: [], control: "k", followUpControl: null },
      ],
    };
    const { svc, platform } = service({ versions: [row(1)], cards: [first] });

    const start = await svc.startingPoint("mcas");

    expect(platform.aiSystem).not.toHaveBeenCalled();
    expect(start.next.versionNumber).toBe(2);
    expect(start.initial?.answers).toEqual({ "q:annex-1:1a": "A" });
    expect(start.initial?.metadata.targetSystemTags).toEqual(["tabular"]);
    expect(start.initial?.metadata.marketFormTags).toEqual(["software"]);
    expect(start.initial?.risks.map((r) => r.risk)).toEqual(["First", "Second"]);
  });
});

describe("the save action reports the platform plainly (S3.6)", () => {
  it("S3.6 shows 'The platform did not answer; nothing was saved' and does not redirect", async () => {
    vi.resetModules();
    const redirect = vi.fn();
    vi.doMock("next/navigation", () => ({ redirect }));
    vi.doMock("@/server/services/FillerClient", () => ({ requestFill: vi.fn(async () => true) }));
    // isolation Q1: the action's door lets the editor in (the non-pid "mcas" would be 404)
    vi.doMock("@/lib/projectDb", () => ({ projectDbForAction: vi.fn(async () => ({ db: {} })) }));
    vi.doMock("@/server/services/QualificationService", async (orig) => {
      const real = (await orig()) as Record<string, unknown>;
      return {
        ...real,
        qualificationService: {
          createFromForm: vi.fn(async () => {
            throw new Error("Could not name this system: the platform did not answer.");
          }),
        },
      };
    });
    const { submitQualification } = await import("@/app/p/[project]/qualify/new/actions");

    const state = await submitQualification("mcas", undefined, new FormData());

    expect(state).toEqual({ error: "The platform did not answer; nothing was saved" });
    expect(redirect).not.toHaveBeenCalled();
    vi.doUnmock("next/navigation");
    vi.doUnmock("@/server/services/FillerClient");
    vi.doUnmock("@/lib/projectDb");
    vi.doUnmock("@/server/services/QualificationService");
  });
});
