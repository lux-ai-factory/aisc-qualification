import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

// The id-addressed entry points that are not the seven card routes of isolationRoutes.test.ts:
//
// - the card version route /p/{pid}/api/system-versions/{systemPid}/ontology.jsonld
//   (control objectives reads it), addressed by a version pid;
// - the server actions of the card page, addressed by a qualification id
//   (loadOntology, patchOntologyNode, resetOntology, linkComponent, unlinkComponent);
// - the card page /p/{pid}/qualify/{id} and the list page, through QualificationService.
//
// The project is the database: the lookup happens in the database of the pid in the URL
// (the action's first argument), so A's card or version under B is 404 even for a member
// of both, and A's database is never opened. A lookup in the wrong database would also find
// nothing in the fake and answer 404, so each test also asserts that the lookup happened in
// B's database.

const caller = vi.hoisted(() => ({ auth: "Bearer person-token" as string | null }));
const calls = vi.hoisted(() => ({ build: [] as unknown[][], deliver: [] as unknown[][] }));

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
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(caller.auth ? { authorization: caller.auth } : {}),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
// The graph build and its store are their own modules' business; here only which
// project and card they are asked for matters.
vi.mock("@/server/services/OntologyService", () => {
  const built = { view: { nodes: [], edges: [] }, problems: [] };
  const record = (name: string) =>
    vi.fn(async (...a: unknown[]) => {
      calls.build.push([name, ...a]);
      return built;
    });
  return {
    ontologyService: { build: record("build"), patchNode: record("patchNode"), resetPatch: record("resetPatch") },
  };
});
vi.mock("@/server/services/KnowledgeGraphStore", () => ({
  knowledgeGraphStore: {
    deliver: vi.fn(async (...a: unknown[]) => {
      calls.deliver.push(a);
      return { document: "{}" };
    }),
  },
}));
vi.mock("@/server/services/EngineClient", () => ({
  engineClient: { components: vi.fn(async () => [{ pid: "c1", component_type: "model", name: "m", data: "" }]) },
}));

import {
  APP,
  MEMBER,
  SRC,
  STRANGER,
  VIEWER,
  constructedUrls,
  dbName,
  fakeDatabases,
  load,
  read,
  rel,
  resetFakes,
  sourceFiles,
  statusOf,
  type Access,
} from "../support/isolation";

const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";
const CARD = "cardofprojecta000000000001";
const VERSION = "a1a1a1a1-0000-4000-8000-000000000001";
const PLATFORM = "http://platform:8000";
const NOT_FOUND = "Qualification not found."; // REFUSED[404]

let access: Record<string, Access> = {};

function fetchStub(input: unknown, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : String((input as { url?: string }).url ?? input);
  const json = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  const m = /\/authz\/projects\/([^/?]+)/.exec(url);
  if (m) {
    const auth = new Headers(init?.headers as HeadersInit).get("authorization");
    return json(auth ? (access[decodeURIComponent(m[1])] ?? STRANGER) : STRANGER);
  }
  if (/system-versions\/latest/.test(url)) return json({ pid: VERSION, number: 1, project_id: A });
  if (/system-versions/.test(url)) return json([{ pid: VERSION, number: 1, project_id: A }]);
  return json({});
}

const openedA = () => constructedUrls.some((u) => u.includes(`/${dbName(A)}`));
const openedB = () => constructedUrls.some((u) => u.includes(`/${dbName(B)}`));

beforeEach(async () => {
  await (await load<{ closeProjectDatabases?: () => Promise<void> }>(join(SRC, "lib", "projectDb.ts"))).mod?.closeProjectDatabases?.();
  resetFakes();
  calls.build.length = 0;
  calls.deliver.length = 0;
  access = {};
  caller.auth = "Bearer person-token";
  vi.stubEnv("PROJECT_DATABASE_URL", "postgresql://qualification_rw:pw@postgres:5432/{database}?schema=qualification&connection_limit=2");
  vi.stubEnv("PLATFORM_URL", PLATFORM);
  vi.stubGlobal("fetch", vi.fn(fetchStub));
  const card = {
    id: CARD, systemId: VERSION, systemName: "MCAS", systemVersion: "1", company: "LIST",
    description: "d", targetUseCase: "u", targetUsers: "t", createdAt: new Date(0),
    answers: [], risks: [], components: [], ontologyExtracted: null,
  };
  fakeDatabases.set(dbName(A), { qualification: [card] });
  fakeDatabases.set(dbName(B), { qualification: [] });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// The card version route

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
const VERSION_ROUTE = join(SRC, "app", "p", "[project]", "api", "system-versions", "[systemPid]", "ontology.jsonld", "route.ts");

async function versionRoute(): Promise<{ GET: Handler }> {
  const { mod, why } = await load<{ GET: Handler }>(VERSION_ROUTE);
  expect(mod, why).not.toBeNull();
  return mod!;
}
const versionReq = (pid: string) =>
  [new Request(`http://q/p/${pid}/api/system-versions/${VERSION}/ontology.jsonld`), { params: Promise.resolve({ project: pid, systemPid: VERSION }) }] as const;

describe("I16.5 the card version route looks the version up in the database of the pid in the URL", () => {
  it("I16.5 a member of both projects gets 404 for A's version under B, looked up in B's database only", async () => {
    access = { [A]: MEMBER, [B]: MEMBER };
    const route = await versionRoute();
    expect(await statusOf(() => route.GET(...versionReq(B)))).toBe(404);
    expect(openedA(), "A's database is never opened under B").toBe(false);
    expect(openedB(), "I3.1: the version is looked up in B's own database").toBe(true);
    expect(calls.deliver).toEqual([]);
  });

  it("I16.5 A's version under A, for a member of A: found in A's database and delivered (200)", async () => {
    access = { [A]: MEMBER };
    const route = await versionRoute();
    const res = await route.GET(...versionReq(A));
    expect(res.status).toBe(200);
    expect(openedA()).toBe(true);
    expect(calls.deliver.map((c) => c[0])).toEqual([CARD]);
  });

  it("I3.1 a stranger to A gets 404 under A and no project database is opened", async () => {
    access = { [B]: MEMBER };
    const route = await versionRoute();
    expect(await statusOf(() => route.GET(...versionReq(A)))).toBe(404);
    expect(constructedUrls.some((u) => u.includes("/project_"))).toBe(false);
  });
});

// The card page's server actions

type OntologyActions = {
  loadOntology: (project: string, id: string) => Promise<{ ok: boolean; error?: string }>;
  patchOntologyNode: (project: string, id: string, node: string, change: unknown) => Promise<{ ok: boolean; error?: string }>;
  resetOntology: (project: string, id: string) => Promise<{ ok: boolean; error?: string }>;
};
type ComponentActions = {
  linkComponent: (project: string, id: string, component: string, prop: string) => Promise<{ ok: boolean; error?: string }>;
  unlinkComponent: (project: string, id: string, component: string) => Promise<{ ok: boolean; error?: string }>;
};
const CARD_PAGE = join(SRC, "app", "p", "[project]", "qualify", "[id]");

async function ontologyActions() {
  const { mod, why } = await load<OntologyActions>(join(CARD_PAGE, "ontology-actions.ts"));
  expect(mod, why).not.toBeNull();
  return mod!;
}
async function componentActions() {
  const { mod, why } = await load<ComponentActions>(join(CARD_PAGE, "component-actions.ts"));
  expect(mod, why).not.toBeNull();
  return mod!;
}

describe("I16.5 I18.3 the card page's actions act on the card in the database of the page's project", () => {
  const underB: [string, (o: OntologyActions, c: ComponentActions) => Promise<{ ok: boolean; error?: string }>][] = [
    ["loadOntology", (o) => o.loadOntology(B, CARD)],
    ["patchOntologyNode", (o) => o.patchOntologyNode(B, CARD, "n1", { label: "x" })],
    ["resetOntology", (o) => o.resetOntology(B, CARD)],
    ["linkComponent", (_o, c) => c.linkComponent(B, CARD, "c1", "hasModel")],
    ["unlinkComponent", (_o, c) => c.unlinkComponent(B, CARD, "c1")],
  ];

  it.each(underB)("I16.5 %s: A's card under B is not found for a member of both, and A's database is never opened", async (_name, act) => {
    access = { [A]: MEMBER, [B]: MEMBER };
    const result = await act(await ontologyActions(), await componentActions());
    expect(result.ok).toBe(false);
    expect(result.error).toBe(NOT_FOUND);
    expect(openedA(), "A's database is never opened for an action posted under B").toBe(false);
    expect(openedB(), "I3.1: the card is looked up in B's own database").toBe(true);
    expect(calls.build).toEqual([]);
  });

  it("I16.5 loadOntology of A's card under A, for a member of A, builds it for project A", async () => {
    access = { [A]: VIEWER };
    const result = await (await ontologyActions()).loadOntology(A, CARD);
    expect(result.ok).toBe(true);
    expect(calls.build).toEqual([["build", A, CARD]]);
    expect(openedA()).toBe(true);
  });

  it("I18.3 a viewer of A is refused (403) a patch of A's card, and nothing is built", async () => {
    access = { [A]: VIEWER };
    const result = await (await ontologyActions()).patchOntologyNode(A, CARD, "n1", { label: "x" });
    expect(result).toEqual({ ok: false, error: "403: you can read this project but not change it." });
    expect(calls.build).toEqual([]);
  });

  it("I18.3 an editor of A patches A's card under A, as project A", async () => {
    access = { [A]: MEMBER };
    const result = await (await ontologyActions()).patchOntologyNode(A, CARD, "n1", { label: "x" });
    expect(result.ok).toBe(true);
    expect(calls.build).toEqual([["patchNode", A, CARD, "n1", { label: "x" }, expect.any(Function)]]);
  });
});

// The pages, through QualificationService

type Service = {
  get: (project: string, id: string) => Promise<{ id: string } | null>;
  list: (project: string) => Promise<{ id: string }[]>;
};
async function service(): Promise<Service> {
  const { mod, why } = await load<{ qualificationService: Service }>(join(SRC, "server", "services", "QualificationService.ts"));
  expect(mod, why).not.toBeNull();
  return mod!.qualificationService;
}

describe("I16.5 the card page and the list page read the database of the page's project", () => {
  it("I16.5 /p/B/qualify/{A's card}: the service finds nothing, in B's database", async () => {
    const s = await service();
    expect(await s.get(B, CARD)).toBeNull();
    expect(openedB(), "I3.1: looked up in B's own database").toBe(true);
    expect(openedA()).toBe(false);
  });

  it("I16.5 /p/A/qualify/{A's card}: found in A's database", async () => {
    const s = await service();
    expect((await s.get(A, CARD))?.id).toBe(CARD);
  });

  it("I16.5 B's list does not show A's card, and A's list does", async () => {
    const s = await service();
    expect(await s.list(B)).toEqual([]);
    expect((await s.list(A)).map((q) => q.id)).toEqual([CARD]);
  });
});

// Read as source: the save action, the seed, the environment

describe("I3.4 I3.6 I3.8 wiring that is only visible in the source", () => {
  it("I3.4 saving builds the card from the form alone; only Refine with AI asks the agent, with the project and the card", () => {
    // The card is deterministic; the filler runs only when a person asks.
    const save = read(join(SRC, "app", "p", "[project]", "qualify", "new", "actions.ts"));
    expect(save).not.toMatch(/requestFill/);
    const refine = read(join(SRC, "app", "p", "[project]", "qualify", "[id]", "fill-actions.ts"));
    expect(refine).toMatch(/requestFill\(\s*project\s*,\s*qualificationId\s*[,)]/);   // then the run's own arguments
  });

  it("I3.6 scripts/migrate-projects.mjs exists and names only ^project_[0-9a-f]{32}$ databases", () => {
    const file = join(APP, "scripts", "migrate-projects.mjs");
    expect(existsSync(file), "I3.6: scripts/migrate-projects.mjs").toBe(true);
    expect(read(file)).toContain("^project_[0-9a-f]{32}$");
  });

  it("I3.6 seed_mcas.mjs writes through the project database of the project it is given, not the global client", () => {
    const text = read(join(APP, "scripts", "seed_mcas.mjs"));
    expect(text, "I3.6: no bare new PrismaClient() (that is DATABASE_URL, platform)").not.toMatch(/new\s+PrismaClient\(\s*\)/);
    expect(text, "I3.6: the seed opens the project's database from PROJECT_DATABASE_URL").toMatch(/PROJECT_DATABASE_URL|projectDb/);
  });

  it("I3.8 nothing in src/ or scripts/ reads DATABASE_URL: project databases come from PROJECT_DATABASE_URL", () => {
    const offenders = [...sourceFiles(), ...sourceFiles(join(APP, "scripts"))]
      .filter((f) => /\bprocess\.env\.DATABASE_URL\b|\benv\.DATABASE_URL\b|\["DATABASE_URL"\]/.test(read(f)))
      .map(rel);
    // prisma/schema.prisma may keep env("DATABASE_URL") for the Prisma CLI, which
    // migrate-projects.mjs sets per database in the child's environment; only reads count.
    expect(offenders).toEqual([]);
  });
});
