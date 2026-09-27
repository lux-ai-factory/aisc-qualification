/**
 * Helpers for the isolation tests (docs/superpowers/isolation-2026-09-25, stage 2).
 *
 * The isolation moves every qualification table into the project's own database
 * and every id-addressed route under /p/{pid}. The tests are written before that
 * code exists, so modules are loaded by computed path: a missing module makes the
 * one test that needs it fail with the requirement named, and `tsc --noEmit`
 * stays as it was.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export const APP = resolve(__dirname, "..", "..");
export const ROOT = resolve(APP, "..", "..");
export const SRC = join(APP, "src");

/** Same example pid as platform/tests/test_project_databases.py and controls' projectDb.test.ts (I1.8). */
export const EXAMPLE_PID = "3f2b8c1e-0d4a-4e7b-9a55-1c2d3e4f5a6b";
export const EXAMPLE_DB = "project_3f2b8c1e0d4a4e7b9a551c2d3e4f5a6b";

export const dbName = (pid: string) => `project_${pid.toLowerCase().replace(/-/g, "")}`;

/** The seven routes that found a card by id alone (I3.3). */
export const CARD_ROUTES = [
  "ai-card.json",
  "ai-card.pdf",
  "system-card.pdf",
  "ontology.jsonld",
  "ontology.ttl",
  "fill",
  "extracted",
] as const;

export const newRouteFile = (name: string) =>
  join(SRC, "app", "p", "[project]", "api", "qualifications", "[id]", name, "route.ts");
export const oldRouteDir = join(SRC, "app", "api", "qualifications");

/** Loads a module by absolute path; null (and the reason) when it is not there. */
export async function load<T = Record<string, unknown>>(
  file: string,
): Promise<{ mod: T | null; why: string }> {
  if (!existsSync(file)) return { mod: null, why: `missing: ${relative(APP, file)}` };
  const path = file;
  try {
    return { mod: (await import(/* @vite-ignore */ path)) as T, why: "" };
  } catch (err) {
    return { mod: null, why: `cannot import ${relative(APP, file)}: ${String(err)}` };
  }
}

/** Every source file under a directory. */
export function sourceFiles(dir: string = SRC): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(p);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

export const read = (file: string) => readFileSync(file, "utf8");
export const rel = (file: string) => relative(APP, file);

/** Q2: the forms work (gate I4.6, two-level forms) is on this branch when these exist. */
export const FORMS_FILES = [
  join(SRC, "server", "repositories", "QuestionSetRepository.ts"),
  join(SRC, "server", "services", "QuestionnaireService.ts"),
  join(APP, "prisma", "migrations", "20260925150000_two_level_forms", "migration.sql"),
];
export const formsMerged = FORMS_FILES.every((f) => existsSync(f));
export const FORMS_SKIP_REASON =
  "I4.6 gate: forms files absent on this branch; WP Q2 waits for the forms merge";

// ── a fake Prisma client: an empty database per URL, unless rows are put in it ──

export type Rows = Record<string, Record<string, unknown>[]>;

/** What each fake database holds, by database name: model name (camelCase) -> rows. */
export const fakeDatabases = new Map<string, Rows>();
/** Every URL a PrismaClient was constructed with, in order. */
export const constructedUrls: string[] = [];

function databaseOf(url: string): string {
  const m = /\/\/[^/]*\/([^?]+)/.exec(url);
  return m ? decodeURIComponent(m[1]) : "";
}

function matches(row: Record<string, unknown>, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  // Only the keys that identify a card: an id or a system id. Anything else in
  // the filter (a project column that no longer exists, a relation) is ignored.
  for (const key of ["id", "systemId"]) {
    if (key in where && typeof where[key] !== "object" && row[key] !== where[key]) return false;
  }
  return true;
}

function model(rows: () => Record<string, unknown>[]) {
  const pick = (args?: { where?: Record<string, unknown> }) => rows().filter((r) => matches(r, args?.where));
  return {
    findUnique: async (a?: { where?: Record<string, unknown> }) => pick(a)[0] ?? null,
    findUniqueOrThrow: async (a?: { where?: Record<string, unknown> }) => {
      const r = pick(a)[0];
      if (!r) throw Object.assign(new Error("No record found"), { code: "P2025" });
      return r;
    },
    findFirst: async (a?: { where?: Record<string, unknown> }) => pick(a)[0] ?? null,
    findFirstOrThrow: async (a?: { where?: Record<string, unknown> }) => {
      const r = pick(a)[0];
      if (!r) throw Object.assign(new Error("No record found"), { code: "P2025" });
      return r;
    },
    findMany: async (a?: { where?: Record<string, unknown> }) => pick(a),
    count: async (a?: { where?: Record<string, unknown> }) => pick(a).length,
    create: async () => {
      throw new Error("fake database: no writes in this test");
    },
    update: async () => {
      throw new Error("fake database: no writes in this test");
    },
    upsert: async () => {
      throw new Error("fake database: no writes in this test");
    },
    delete: async () => {
      throw new Error("fake database: no writes in this test");
    },
    deleteMany: async () => ({ count: 0 }),
    updateMany: async () => ({ count: 0 }),
  };
}

/** Stands in for PrismaClient: records its URL; every model reads that URL's fake rows. */
export class FakePrismaClient {
  readonly url: string;
  readonly database: string;
  constructor(options?: { datasourceUrl?: string; datasources?: { db?: { url?: string } } }) {
    this.url = options?.datasourceUrl ?? options?.datasources?.db?.url ?? process.env.DATABASE_URL ?? "";
    this.database = databaseOf(this.url);
    constructedUrls.push(this.url);
    return new Proxy(this, {
      get: (target, prop, receiver) => {
        if (typeof prop !== "string" || prop in target) return Reflect.get(target, prop, receiver);
        if (prop === "then") return undefined;
        return model(() => fakeDatabases.get(target.database)?.[prop] ?? []);
      },
    });
  }
  async $connect() {}
  async $disconnect() {}
  $use() {}
  $on() {}
  $extends() {
    return this;
  }
  async $queryRaw() {
    return [];
  }
  async $queryRawUnsafe() {
    return [];
  }
  async $executeRaw() {
    return 0;
  }
  async $executeRawUnsafe() {
    return 0;
  }
  async $transaction(arg: unknown) {
    if (typeof arg === "function") return (arg as (tx: unknown) => unknown)(this);
    return Promise.all(arg as Promise<unknown>[]);
  }
}

export function resetFakes() {
  fakeDatabases.clear();
  constructedUrls.length = 0;
}

/** What the platform says about a caller in a project (the /authz/projects/{pid} answer). */
export type Access = { role: string | null; admin: boolean; may_write: boolean };
export const MEMBER: Access = { role: "editor", admin: false, may_write: true };
export const VIEWER: Access = { role: "viewer", admin: false, may_write: false };
export const STRANGER: Access = { role: null, admin: false, may_write: false };

/**
 * A fetch that answers the platform's /authz/projects/{pid} from `access`
 * (per pid, or one answer for all; "silent" = the platform does not answer),
 * records every URL it was asked, and answers anything else from `other`.
 */
export function platformFetch(
  access: Access | "silent" | Record<string, Access | "silent">,
  other: (url: string, init?: RequestInit) => Promise<Response> = async () =>
    new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = async (input: unknown, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String((input as { url?: string }).url ?? input);
    calls.push({ url, init });
    const m = /\/authz\/projects\/([^/?]+)/.exec(url);
    if (m) {
      const pid = decodeURIComponent(m[1]);
      const a =
        typeof access === "string" || "role" in (access as object)
          ? (access as Access | "silent")
          : ((access as Record<string, Access | "silent">)[pid] ?? STRANGER);
      if (a === "silent") throw new Error("ECONNREFUSED (simulated platform outage)");
      return new Response(JSON.stringify(a), { status: 200, headers: { "content-type": "application/json" } });
    }
    return other(url, init);
  };
  return { impl, calls };
}

/** Whether a thrown value is Next's notFound() (as the navigation mock throws it). */
export const NOT_FOUND = "NEXT_NOT_FOUND";
export const isNotFound = (err: unknown) =>
  err instanceof Error && (err.message === NOT_FOUND || (err as { digest?: string }).digest === NOT_FOUND);

/** The status a route handler's result or thrown notFound() amounts to. */
export async function statusOf(run: () => Promise<Response>): Promise<number> {
  try {
    return (await run()).status;
  } catch (err) {
    if (isNotFound(err)) return 404;
    throw err;
  }
}
