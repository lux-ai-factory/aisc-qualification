import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

// Isolation stage 2 (docs/superpowers/isolation-2026-09-25/01-specs.md, I1.8, I3.1, I17.1).
// Every qualification table moves into the project's own database. src/lib/projectDb.ts
// (controls' src/lib/projectDb.ts is the model) is the only way in: projectDbFor asks the
// platform about the caller in THAT project first, and only then opens its database.
//
// Seams faked here, none of them the module under test: the Prisma client (a fake that
// records its URL), the migration child process, Next's notFound and headers, and fetch
// (the platform). Written before the module exists: each test loads it by path and fails
// with the requirement named until it does.

vi.mock("@prisma/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@prisma/client")>();
  const { FakePrismaClient } = await import("../support/isolation");
  return { ...actual, PrismaClient: FakePrismaClient };
});
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const ok = (...args: unknown[]) => {
    const cb = args[args.length - 1];
    if (typeof cb === "function") (cb as (e: null, out: string, err: string) => void)(null, "", "");
    return { on: () => undefined } as unknown;
  };
  return { ...actual, execFile: ok, exec: ok, execFileSync: () => "", execSync: () => "" };
});
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_NOT_FOUND" });
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ authorization: "Bearer caller-token-of-a-person" }),
  cookies: async () => ({ get: () => undefined }),
}));

import {
  EXAMPLE_DB,
  EXAMPLE_PID,
  MEMBER,
  SRC,
  STRANGER,
  VIEWER,
  constructedUrls,
  isNotFound,
  load,
  platformFetch,
  read,
  rel,
  resetFakes,
  sourceFiles,
} from "../support/isolation";

type ProjectDb = {
  projectDatabaseName: (pid: string) => string;
  projectDatabaseUrl: (pid: string, template?: string) => string;
  prismaFor: (pid: string, deps?: { migrate: (url: string) => Promise<void> }) => Promise<unknown>;
  projectDbFor: (pid: string, opts: { write: boolean }) => Promise<unknown>;
  closeProjectDatabases?: () => Promise<void>;
  isMissingDatabase?: (err: unknown) => boolean;
  MAX_OPEN_PROJECTS?: number;
  NotAProject?: new (...a: unknown[]) => Error;
};

const FILE = join(SRC, "lib", "projectDb.ts");
async function projectDb(): Promise<ProjectDb> {
  const { mod, why } = await load<ProjectDb>(FILE);
  expect(mod, `I3.1: src/lib/projectDb.ts is the only way into a project database (${why})`).not.toBeNull();
  return mod as ProjectDb;
}

const TEMPLATE = "postgresql://qualification_rw:pw@postgres:5432/{database}?schema=qualification&connection_limit=2";
const PLATFORM = "http://platform:8000";
const pidN = (n: number) => `${n.toString(16).padStart(8, "0")}-0000-4000-8000-00000000000a`;

beforeEach(async () => {
  resetFakes();
  vi.stubEnv("PROJECT_DATABASE_URL", TEMPLATE);
  vi.stubEnv("PLATFORM_URL", PLATFORM);
  if (existsSync(FILE)) await (await projectDb()).closeProjectDatabases?.();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("I1.8 one name rule: project_ + the lowercase pid without hyphens", () => {
  it("I1.8 the example pid maps to the same database name as in the platform's and controls' tests", async () => {
    const m = await projectDb();
    expect(m.projectDatabaseName(EXAMPLE_PID)).toBe(EXAMPLE_DB);
    expect(m.projectDatabaseName(EXAMPLE_PID.toUpperCase())).toBe(EXAMPLE_DB);
  });

  it.each(["", "abc", "../platform", `${EXAMPLE_PID}x`, `${EXAMPLE_PID}\n`, "x'; drop database platform; --", "microcredit-assist-score-mcas"])(
    "I1.8 %j is refused before anything is built",
    async (bad) => {
      const m = await projectDb();
      expect(() => m.projectDatabaseName(bad)).toThrow();
    },
  );
});

describe("I3.1 projectDatabaseUrl", () => {
  it("I3.1 fills {database} of PROJECT_DATABASE_URL and keeps schema=qualification and connection_limit=2", async () => {
    const m = await projectDb();
    const url = m.projectDatabaseUrl(EXAMPLE_PID, TEMPLATE);
    expect(url).toContain(`/${EXAMPLE_DB}?`);
    expect(url).toContain("schema=qualification");
    expect(url).toContain("connection_limit=2");
    expect(url).not.toMatch(/\/platform\b/);
  });

  it("I3.1 I17.1 a template without schema or limit still gets schema=qualification and connection_limit=2", async () => {
    // Decision recorded in 02-tests.md: the per-project budget (section 17) is the module's, not the env's.
    const m = await projectDb();
    const url = m.projectDatabaseUrl(EXAMPLE_PID, "postgresql://qualification_rw:pw@postgres:5432/{database}");
    expect(url).toContain(`/${EXAMPLE_DB}`);
    expect(url).toContain("schema=qualification");
    expect(url).toContain("connection_limit=2");
  });

  it("I3.1 refuses a template with nowhere to put the database", async () => {
    const m = await projectDb();
    expect(() => m.projectDatabaseUrl(EXAMPLE_PID, "postgresql://x@y/platform?schema=qualification")).toThrow(/\{database\}/);
  });

  it("I3.1 reads the template from PROJECT_DATABASE_URL", async () => {
    const m = await projectDb();
    expect(m.projectDatabaseUrl(EXAMPLE_PID)).toContain(`/${EXAMPLE_DB}?`);
  });
});

describe("I3.1 I17.1 prismaFor: one client per database, migrated once, at most 20", () => {
  it("I3.1 migrates a project's database once, however many first requests arrive together", async () => {
    const m = await projectDb();
    const migrate = vi.fn((_url: string) => new Promise<void>((r) => setTimeout(r, 20)));
    const [a, b] = await Promise.all([m.prismaFor(pidN(1), { migrate }), m.prismaFor(pidN(1), { migrate })]);
    expect(migrate).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(migrate.mock.calls[0][0]).toContain(`/${"project_" + pidN(1).replace(/-/g, "")}`);
  });

  it("I3.1 a failed migration is forgotten, so the next request tries again", async () => {
    const m = await projectDb();
    const migrate = vi.fn().mockRejectedValueOnce(new Error("db starting")).mockResolvedValue(undefined);
    await expect(m.prismaFor(pidN(2), { migrate })).rejects.toThrow("db starting");
    await expect(m.prismaFor(pidN(2), { migrate })).resolves.toBeDefined();
    expect(migrate).toHaveBeenCalledTimes(2);
  });

  it("I3.1 two projects get two clients, on two databases", async () => {
    const m = await projectDb();
    const migrate = vi.fn(async () => {});
    const a = await m.prismaFor(pidN(3), { migrate });
    const b = await m.prismaFor(pidN(4), { migrate });
    expect(a).not.toBe(b);
  });

  it("I17.1 at most 20 are open; the least recently used is disconnected and reopened (migrated) later", async () => {
    const m = await projectDb();
    expect(m.MAX_OPEN_PROJECTS, "I17.1: the LRU cap is exported and is 20").toBe(20);
    const migrate = vi.fn(async () => {});
    const clients: { $disconnect: () => Promise<void> }[] = [];
    for (let i = 0; i < 20; i++) clients.push((await m.prismaFor(pidN(100 + i), { migrate })) as never);
    const spies = clients.map((c) => vi.spyOn(c, "$disconnect"));
    await m.prismaFor(pidN(100), { migrate }); // used again: now the most recent
    await m.prismaFor(pidN(120), { migrate }); // the 21st
    expect(spies[1]).toHaveBeenCalledTimes(1);
    expect(spies.filter((s) => s.mock.calls.length > 0)).toHaveLength(1);
    const before = migrate.mock.calls.length;
    expect(await m.prismaFor(pidN(101), { migrate })).not.toBe(clients[1]);
    expect(migrate.mock.calls.length).toBe(before + 1);
  });

  it("I2.5 I17.1 recognises the error Postgres gives for a dropped database (to evict it and answer 404)", async () => {
    const m = await projectDb();
    expect(m.isMissingDatabase, "I2.5: isMissingDatabase is exported").toBeTypeOf("function");
    expect(m.isMissingDatabase!({ errorCode: "P1003", message: "Database `project_x` does not exist" })).toBe(true);
    expect(m.isMissingDatabase!(new Error('database "project_x" does not exist'))).toBe(true);
    expect(m.isMissingDatabase!({ code: "P2002" })).toBe(false);
    expect(m.isMissingDatabase!(new Error("connection refused"))).toBe(false);
  });
});

describe("I3.1 projectDbFor: the platform decides, and only then is the database opened", () => {
  const opened = () => constructedUrls.filter((u) => u.includes("/project_"));

  it("I3.1 not a pid: 404 before the platform is asked", async () => {
    const m = await projectDb();
    const platform = platformFetch(MEMBER);
    vi.stubGlobal("fetch", platform.impl);
    for (const bad of ["microcredit-assist-score-mcas", "../platform", ""]) {
      const err = await m.projectDbFor(bad, { write: false }).catch((e) => e);
      expect(isNotFound(err), `I3.1: ${JSON.stringify(bad)} is notFound()`).toBe(true);
    }
    expect(platform.calls).toHaveLength(0);
    expect(opened()).toHaveLength(0);
  });

  it("I3.1 asks the platform about this pid with the caller's own token", async () => {
    const m = await projectDb();
    const platform = platformFetch(MEMBER);
    vi.stubGlobal("fetch", platform.impl);
    await m.projectDbFor(EXAMPLE_PID, { write: false });
    const ask = platform.calls.find((c) => c.url.includes("/authz/projects/"));
    expect(ask?.url).toBe(`${PLATFORM}/authz/projects/${EXAMPLE_PID}`);
    const auth = new Headers(ask?.init?.headers as HeadersInit).get("authorization");
    expect(auth).toBe("Bearer caller-token-of-a-person");
  });

  it("I3.1 a member reads: the client opened is on this project's database, never on platform", async () => {
    const m = await projectDb();
    vi.stubGlobal("fetch", platformFetch(MEMBER).impl);
    await m.projectDbFor(EXAMPLE_PID, { write: true });
    expect(opened().length).toBeGreaterThan(0);
    for (const url of constructedUrls) {
      expect(url, "I3.1: nothing but the project database is opened").toContain(`/${EXAMPLE_DB}`);
    }
  });

  it("I3.1 a stranger is 404 and no database is opened", async () => {
    const m = await projectDb();
    vi.stubGlobal("fetch", platformFetch(STRANGER).impl);
    const err = await m.projectDbFor(EXAMPLE_PID, { write: false }).catch((e) => e);
    expect(isNotFound(err)).toBe(true);
    expect(opened()).toHaveLength(0);
  });

  it("I3.1 a viewer may read, and is refused (403) a write before anything is opened", async () => {
    const m = await projectDb();
    vi.stubGlobal("fetch", platformFetch(VIEWER).impl);
    const err = await m.projectDbFor(EXAMPLE_PID, { write: true }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(isNotFound(err)).toBe(false);
    const e = err as { status?: number; message: string };
    expect(e.status === 403 || /403|read .* not change|not change/i.test(e.message), `I3.1: viewer write is 403: ${e.message}`).toBe(true);
    expect(opened()).toHaveLength(0);
    await expect(m.projectDbFor(EXAMPLE_PID, { write: false })).resolves.toBeDefined();
  });

  it("I3.1 the platform silent: refused (503), fail closed, nothing opened", async () => {
    const m = await projectDb();
    vi.stubGlobal("fetch", platformFetch("silent").impl);
    const err = await m.projectDbFor(EXAMPLE_PID, { write: false }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(isNotFound(err)).toBe(false);
    const e = err as { status?: number; message: string };
    expect(e.status === 503 || /platform/i.test(e.message), `I3.1: platform silent is 503: ${e.message}`).toBe(true);
    expect(opened()).toHaveLength(0);
  });
});

describe("I3.1 source scan: projectDb.ts is the only door", () => {
  it("I3.1 src/lib/prisma.ts (the global client on platform) is deleted", () => {
    expect(existsSync(join(SRC, "lib", "prisma.ts")), "I3.1: src/lib/prisma.ts must be deleted").toBe(false);
  });

  it("I3.1 `new PrismaClient` of the project client appears in src/ only inside src/lib/projectDb.ts", () => {
    // Decision (02-tests.md): the form library's own generated client (I4.2) is a
    // different import, so this scan counts only files importing "@prisma/client".
    const offenders = sourceFiles()
      .filter((f) => /from ["']@prisma\/client["']/.test(read(f)) && /new\s+PrismaClient\b/.test(read(f)))
      .map(rel)
      .filter((f) => f !== "src/lib/projectDb.ts");
    expect(offenders).toEqual([]);
    expect(existsSync(FILE), "I3.1: src/lib/projectDb.ts exists").toBe(true);
  });

  it("I3.1 prismaFor is called nowhere in src/ but inside projectDb.ts", () => {
    const offenders = sourceFiles()
      .filter((f) => rel(f) !== "src/lib/projectDb.ts" && /\bprismaFor\s*\(/.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("I3.1 nothing in src/ imports @/lib/prisma any more", () => {
    const offenders = sourceFiles()
      .filter((f) => /["']@\/lib\/prisma["']/.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });
});
