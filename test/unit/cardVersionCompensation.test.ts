import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { QualificationService } from "@/server/services/QualificationService";
import { PlatformClient } from "@/server/services/PlatformClient";
import { defaultVersionLiteral } from "../support/forms";
import { transactional } from "../support/ledgerRepo";

// A save makes the next card version on the platform first, then the card in the project's
// database. When the card is not stored, the version made for it must not stay behind as an
// empty card version: the save names an attempt, and the version of that attempt is withdrawn.
// The person is told exactly which of three things happened.

const WITHDRAWN = "The card was not saved. The card version made for it was withdrawn.";
const NONE = "The card was not saved, and no card version was made.";
const UNKNOWN =
  "The card was not saved. The platform may hold an empty card version; it could not be withdrawn, so ask an admin to check the card versions.";

const version = (number: number) => ({
  pid: `v${number}`,
  number,
  project_id: "core-project-1",
  name: "Acme Vision",
  version: "1.0",
  provider: null,
  description: null,
  created_at: "2026-09-25T09:00:00Z",
  created_by: null,
  cardRevision: 1,
});

function parsed() {
  return {
    systemName: "Acme Vision",
    systemVersion: "1.0",
    company: "Acme Corp",
    description: "A vision system.",
    targetUseCase: "",
    targetUsers: "",
    intendedDeployers: null,
    targetSystemTags: [],
    sectorTags: [],
    marketFormTags: [],
    localityTags: [],
    answers: [],
    risks: [],
    systemComponents: [],
  };
}

type Opts = {
  createVersion?: (...a: unknown[]) => Promise<unknown>;
  abandonVersion?: (...a: unknown[]) => Promise<unknown>;
  cardWrite?: "throws" | "ok";
};

function setup(opts: Opts = {}) {
  const platform = {
    createVersion: vi.fn(opts.createVersion ?? (async () => version(1))),
    abandonVersion: vi.fn(opts.abandonVersion ?? (async () => "abandoned")),
    reviseVersion: vi.fn(),
    listVersions: vi.fn(async () => []),
    syncTargets: vi.fn(async () => undefined),
  };
  const repo = transactional({
    transaction: async (fn: (r: unknown, t: unknown) => unknown) => {
      if (opts.cardWrite === "throws") throw new Error("the project database refused the card");
      return fn(repo, { $executeRaw: vi.fn(async () => 1) });
    },
    create: vi.fn(async () => ({ id: "card-1" })),
    cardRefs: vi.fn(async () => []),
    find: vi.fn(async () => null),
  });
  const parser = { parse: vi.fn(() => parsed()) };
  const formsFor = vi.fn(async () => ({ resolve: vi.fn(async () => defaultVersionLiteral()) }));
  const review = { reviewToCarry: vi.fn() };
  const engine = { components: vi.fn(async () => []) };
  const svc = new (QualificationService as unknown as new (...a: unknown[]) => QualificationService)(
    repo, parser, platform, formsFor, review, engine,
  );
  return { svc, platform };
}

const attemptOf = (call: unknown[]) => call[2];

describe("a card version is withdrawn when its card is not saved", () => {
  it("a card write that fails withdraws the version made for it, by the same attempt", async () => {
    const { svc, platform } = setup({ cardWrite: "throws" });
    const err = await svc.createFromForm("mcas", new FormData()).catch((e) => e);
    expect(err).toMatchObject({ version: "withdrawn" });
    expect(platform.createVersion).toHaveBeenCalledTimes(1);
    const attempt = attemptOf(platform.createVersion.mock.calls[0] as unknown[]);
    expect(typeof attempt).toBe("string");
    expect(platform.abandonVersion).toHaveBeenCalledWith("mcas", attempt, expect.any(String));
  });

  it("a create that timed out after the platform committed is withdrawn by its attempt", async () => {
    const { svc, platform } = setup({
      createVersion: async () => {
        throw new Error("Could not name this system: the platform did not answer.");
      },
      abandonVersion: async () => "abandoned",
    });
    const err = await svc.createFromForm("mcas", new FormData()).catch((e) => e);
    expect(err).toMatchObject({ version: "withdrawn" });
    const attempt = attemptOf(platform.createVersion.mock.calls[0] as unknown[]);
    expect(platform.abandonVersion).toHaveBeenCalledWith("mcas", attempt, expect.any(String));
  });

  it("a create that never reached the platform says no version was made", async () => {
    const { svc } = setup({
      createVersion: async () => {
        throw new Error("Could not name this system: the platform did not answer.");
      },
      abandonVersion: async () => "none",
    });
    const err = await svc.createFromForm("mcas", new FormData()).catch((e) => e);
    expect(err).toMatchObject({ version: "none" });
  });

  it("an abandon the platform cannot answer says the version is unknown", async () => {
    const { svc } = setup({
      cardWrite: "throws",
      abandonVersion: async () => {
        throw new Error("Could not withdraw this card version: the platform did not answer.");
      },
    });
    const err = await svc.createFromForm("mcas", new FormData()).catch((e) => e);
    expect(err).toMatchObject({ version: "unknown" });
  });
});

describe("the platform client withdraws a version by its attempt", () => {
  it("posts the attempt and the reason to the abandon route and reads 200 as abandoned", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => version(1) });
    const client = new PlatformClient("http://platform:8000", fetchImpl) as unknown as {
      abandonVersion?: (p: string, a: string, r: string) => Promise<string>;
    };
    expect(typeof client.abandonVersion).toBe("function");
    const out = await client.abandonVersion!("mcas", "attempt-1", "card not saved");
    expect(out).toBe("abandoned");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://platform:8000/projects/mcas/system-versions/abandon");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ attempt: "attempt-1", reason: "card not saved" });
  });

  it("reads 404 as no version made", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ detail: "none" }) });
    const client = new PlatformClient("http://platform:8000", fetchImpl) as unknown as {
      abandonVersion?: (p: string, a: string, r: string) => Promise<string>;
    };
    expect(typeof client.abandonVersion).toBe("function");
    expect(await client.abandonVersion!("mcas", "attempt-1", "card not saved")).toBe("none");
  });
});

describe("the save action says exactly what happened to the version", () => {
  it.each([
    ["withdrawn", WITHDRAWN],
    ["none", NONE],
    ["unknown", UNKNOWN],
  ])("a card not saved with the version %s shows its message", async (state, copy) => {
    vi.resetModules();
    const notSaved = Object.assign(new Error("card not saved"), { name: "CardNotSaved", version: state });
    vi.doMock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
    vi.doMock("@/lib/projectDb", () => ({ projectDbForAction: async () => ({ db: {} }) }));
    vi.doMock("@/vendor/aisc-ledger/emit", () => ({ emitEvent: vi.fn() }));
    vi.doMock("@/server/services/QualificationService", async () => {
      const real = await vi.importActual<Record<string, unknown>>("@/server/services/QualificationService");
      const Cls = real.CardNotSaved as (new (v: string) => Error) | undefined;
      const thrown = Cls ? new Cls(state) : notSaved;
      return {
        ...real,
        qualificationService: { createFromForm: vi.fn(async () => Promise.reject(thrown)), reviseFromForm: vi.fn() },
      };
    });
    const { submitQualification } = await import("@/app/p/[project]/qualify/new/actions");
    const fd = new FormData();
    fd.set("change", "system");
    const out = await submitQualification("mcas", undefined, fd).catch((e: unknown) => ({ thrown: String(e) }));
    expect(out).toEqual({ error: copy });
  });

  it("no longer tells the person that nothing was saved when the platform is silent", () => {
    const src = readFileSync(
      join(__dirname, "../../src/app/p/[project]/qualify/new/actions.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/nothing was saved/);
  });
});
