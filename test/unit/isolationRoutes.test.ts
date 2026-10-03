import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";

// Every route that addresses a card by its id is under the project:
// /p/{pid}/api/qualifications/{id}/{ai-card.json, ai-card.pdf, system-card.pdf,
// ontology.jsonld, ontology.ttl, fill, extracted}. Each opens that pid's database and looks
// the card up there, so a card of project A opened under project B is 404: it is not in B's
// database. That holds even for somebody who is a member of both.
//
// The databases are fakes (test/support/isolation.ts): one per database name, holding what a
// test puts in it, and recording every URL a client was opened on. The real thing runs
// against Postgres in test/db/projectDatabase.db.test.ts.

const caller = vi.hoisted(() => ({ auth: "Bearer person-token" as string | null }));

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
// The export shape is QualificationExporter's own business (tested there); here only the id matters.
vi.mock("@/server/services/QualificationExporter", () => ({
  toExport: (q: { id: string }) => ({ id: q.id }),
}));

import {
  CARD_ROUTES,
  MEMBER,
  SRC,
  STRANGER,
  VIEWER,
  constructedUrls,
  dbName,
  fakeDatabases,
  load,
  newRouteFile,
  oldRouteDir,
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
const AGENT = "http://qualification-agents:8012";
const PLATFORM = "http://platform:8000";
// Split so the credential scanner (secrets.test.ts) does not read it as a real one.
const AGENT_TOKEN = ["agent", "to", "web", "iso", "test", "0001"].join("-");
const WEB_TO_AGENTS = ["web", "to", "agents", "iso", "test", "0001"].join("-");
const HEADER = "X-AISC-Service-Token";

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type RouteModule = Partial<Record<"GET" | "PUT" | "POST" | "DELETE", Handler>>;

/** Access per project for a person; an agent (no Authorization) is nobody to the platform. */
let access: Record<string, Access> = {};
let platformAsked: string[] = [];
let agentAsked: string[] = [];

function fetchStub(input: unknown, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : String((input as { url?: string }).url ?? input);
  const json = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  const m = /\/authz\/projects\/([^/?]+)/.exec(url);
  if (m) {
    platformAsked.push(url);
    const auth = new Headers(init?.headers as HeadersInit).get("authorization");
    const a = auth ? (access[decodeURIComponent(m[1])] ?? STRANGER) : STRANGER;
    return json(a);
  }
  if (url.startsWith(AGENT)) {
    agentAsked.push(url);
    return json({ state: "done" });
  }
  if (/system-versions\/latest|\/systems\//.test(url)) return json({ pid: VERSION, number: 1 });
  return json({});
}

async function route(name: string): Promise<RouteModule> {
  const { mod, why } = await load<RouteModule>(newRouteFile(name));
  expect(mod, `I3.3: /p/{pid}/api/qualifications/{id}/${name} is a route (${why})`).not.toBeNull();
  return mod as RouteModule;
}

const url = (pid: string, name: string) => `http://q/p/${pid}/api/qualifications/${CARD}/${name}`;
const ctx = (pid: string) => ({ params: Promise.resolve({ project: pid, id: CARD }) });
function request(pid: string, name: string, method: string, headers: Record<string, string> = {}) {
  const init: RequestInit = { method, headers };
  if (method === "PUT" || method === "POST") init.body = JSON.stringify({ techniques: [] });
  return new Request(url(pid, name), init);
}

beforeEach(() => {
  resetFakes();
  access = {};
  platformAsked = [];
  agentAsked = [];
  caller.auth = "Bearer person-token";
  vi.stubEnv("PROJECT_DATABASE_URL", "postgresql://qualification_rw:pw@postgres:5432/{database}?schema=qualification&connection_limit=2");
  vi.stubEnv("PLATFORM_URL", PLATFORM);
  vi.stubEnv("AGENT_SERVICE_URL", AGENT);
  vi.stubEnv("QUALIFICATION_AGENTS_TO_WEB_TOKEN", AGENT_TOKEN);
  vi.stubEnv("QUALIFICATION_WEB_TO_AGENTS_TOKEN", WEB_TO_AGENTS);
  vi.stubGlobal("fetch", vi.fn(fetchStub));
  // The card exists in A's database only.
  fakeDatabases.set(dbName(A), {
    qualification: [{ id: CARD, systemId: VERSION, systemName: "MCAS", systemVersion: "1", ontologyExtracted: null }],
  });
  fakeDatabases.set(dbName(B), { qualification: [] });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("I3.3 the id-addressed routes move under /p/{pid}", () => {
  it("I3.3 the old /api/qualifications/* route files are gone, so those paths are 404", () => {
    expect(existsSync(oldRouteDir), `I3.3: ${rel(oldRouteDir)} must be deleted`).toBe(false);
  });

  it.each(CARD_ROUTES)("I3.3 /p/{pid}/api/qualifications/{id}/%s exists", (name) => {
    expect(existsSync(newRouteFile(name)), `I3.3: ${rel(newRouteFile(name))}`).toBe(true);
  });

  it("I3.3 every link, download and fetch to a card route in src/ goes through /p/{pid}", () => {
    const offenders: string[] = [];
    for (const f of sourceFiles()) {
      read(f)
        .split("\n")
        .forEach((line, i) => {
          const code = line.trim();
          if (code.startsWith("*") || code.startsWith("//") || code.startsWith("/*")) return;
          if (/api\/qualifications\//.test(code) && !/\/p\/[^"'`]*api\/qualifications\//.test(code)) {
            offenders.push(`${rel(f)}:${i + 1}: ${code}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });

  it("I3.3 every revalidatePath names the page under /p/{pid}", () => {
    const offenders: string[] = [];
    for (const f of sourceFiles()) {
      for (const m of read(f).matchAll(/revalidatePath\(\s*([`'"])(.*?)\1/g)) {
        if (!m[2].startsWith("/p/")) offenders.push(`${rel(f)}: revalidatePath(${m[1]}${m[2]}${m[1]})`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("I3.3 I16.5 a card of project A opened under project B is 404 on every route", () => {
  const methods = (mod: RouteModule) => (["GET", "PUT", "POST", "DELETE"] as const).filter((m) => mod[m]);

  it.each(CARD_ROUTES)("I16.5 %s: a member of B only gets 404 for A's card, and only B's database is opened", async (name) => {
    access = { [B]: MEMBER };
    const mod = await route(name);
    for (const method of methods(mod)) {
      const status = await statusOf(() => mod[method]!(request(B, name, method), ctx(B)));
      expect(status, `${method} ${name} under B`).toBe(404);
    }
    expect(constructedUrls.some((u) => u.includes(`/${dbName(A)}`)), "A's database is never opened").toBe(false);
    expect(constructedUrls.some((u) => /\/platform\b/.test(u)), "platform is never opened for a card").toBe(false);
  });

  it.each(CARD_ROUTES)("I16.5 %s: even a member of both projects gets 404 for A's card under B", async (name) => {
    access = { [A]: MEMBER, [B]: MEMBER };
    const mod = await route(name);
    for (const method of methods(mod)) {
      const status = await statusOf(() => mod[method]!(request(B, name, method), ctx(B)));
      expect(status, `${method} ${name} under B`).toBe(404);
    }
    expect(constructedUrls.some((u) => u.includes(`/${dbName(A)}`))).toBe(false);
    expect(agentAsked).toEqual([]);
  });

  it.each(CARD_ROUTES)("I3.3 %s: a stranger to A gets 404 for A's card under A, and no database is opened", async (name) => {
    access = { [B]: MEMBER };
    const mod = await route(name);
    for (const method of methods(mod)) {
      const status = await statusOf(() => mod[method]!(request(A, name, method), ctx(A)));
      expect(status, `${method} ${name} under A`).toBe(404);
    }
    expect(constructedUrls.some((u) => u.includes("/project_"))).toBe(false);
  });

  it("I16.5 the card agent's token does not open A's card under B either (extracted GET and PUT)", async () => {
    caller.auth = null;
    const mod = await route("extracted");
    for (const method of ["GET", "PUT"] as const) {
      const status = await statusOf(() => mod[method]!(request(B, "extracted", method, { [HEADER]: AGENT_TOKEN }), ctx(B)));
      expect(status, `${method} extracted under B with the agent token`).toBe(404);
    }
    expect(constructedUrls.some((u) => u.includes(`/${dbName(A)}`))).toBe(false);
  });
});

describe("I3.4 I18.1 I18.4 the card agent", () => {
  it("I3.4 I18.4 GET extracted with the agent's token reads the card in that pid's database and returns projectId = that pid", async () => {
    caller.auth = null;
    const mod = await route("extracted");
    const res = await mod.GET!(request(A, "extracted", "GET", { [HEADER]: AGENT_TOKEN }), ctx(A));
    expect(res.status).toBe(200);
    expect((await res.json()).projectId).toBe(A);
    expect(constructedUrls.some((u) => u.includes(`/${dbName(A)}`))).toBe(true);
  });

  it("I18.4 the project returned is the database's, never one the caller put in the query", async () => {
    caller.auth = null;
    const mod = await route("extracted");
    const req = new Request(`${url(A, "extracted")}?project=${B}`, { headers: { [HEADER]: AGENT_TOKEN } });
    const res = await mod.GET!(req, ctx(A));
    expect((await res.json()).projectId).toBe(A);
  });

  it("I18.1 a wrong agent token on extracted is 401 and nothing is opened", async () => {
    caller.auth = null;
    const mod = await route("extracted");
    const res = await mod.GET!(request(A, "extracted", "GET", { [HEADER]: AGENT_TOKEN + "x" }), ctx(A));
    expect(res.status).toBe(401);
    expect(constructedUrls.some((u) => u.includes("/project_"))).toBe(false);
  });

  it.each(CARD_ROUTES.filter((r) => r !== "extracted"))(
    "I18.1 the agent's token opens nothing on %s: without a person it is a stranger (404)",
    async (name) => {
      caller.auth = null;
      const mod = await route(name);
      const status = await statusOf(() => mod.GET!(request(A, name, "GET", { [HEADER]: AGENT_TOKEN }), ctx(A)));
      expect(status).toBe(404);
    },
  );

  it("I3.4 the fill poll asks the agent for GET /fill/{pid}/{id}", async () => {
    access = { [A]: MEMBER };
    const mod = await route("fill");
    const res = await mod.GET!(request(A, "fill", "GET"), ctx(A));
    expect(res.status).toBe(200);
    expect(agentAsked).toEqual([`${AGENT}/fill/${A}/${CARD}`]);
  });

  it("I3.4 FillerClient posts to {AGENT_SERVICE_URL}/fill/{pid}/{qualificationId}", async () => {
    const { mod, why } = await load<{
      FillerClient: new (url: string, f: typeof fetch, token: string) => { request: (...a: string[]) => Promise<boolean> };
      requestFill: (...a: string[]) => Promise<boolean>;
    }>(join(SRC, "server", "services", "FillerClient.ts"));
    expect(mod, why).not.toBeNull();
    const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
    const client = new mod!.FillerClient(AGENT, fetchImpl as unknown as typeof fetch, WEB_TO_AGENTS);
    expect(await client.request(A, CARD)).toBe(true);
    expect((fetchImpl.mock.calls[0] as unknown[])[0]).toBe(`${AGENT}/fill/${A}/${CARD}`);
    expect(((fetchImpl.mock.calls[0] as unknown[])[1] as RequestInit).method).toBe("POST");
    expect(mod!.requestFill.length, "I3.4: requestFill(pid, qualificationId)").toBe(2);
  });
});

describe("I18.3 a write needs an editor of the card's own project, the database it is in", () => {
  it("I18.3 a viewer of A is refused (403) the PUT of A's extracted draft, before anything is written", async () => {
    access = { [A]: VIEWER };
    const mod = await route("extracted");
    const status = await statusOf(() => mod.PUT!(request(A, "extracted", "PUT"), ctx(A)));
    expect(status).toBe(403);
  });

  it("I18.3 an editor of B cannot write A's card through B (404)", async () => {
    access = { [B]: MEMBER };
    const mod = await route("extracted");
    const status = await statusOf(() => mod.PUT!(request(B, "extracted", "PUT"), ctx(B)));
    expect(status).toBe(404);
  });
});

describe("I3.2 the middleware", () => {
  type Mw = { middleware: (r: NextRequest) => Promise<Response> };
  const middleware = async () => {
    const { mod, why } = await load<Mw>(join(SRC, "middleware.ts"));
    expect(mod, why).not.toBeNull();
    return mod!.middleware;
  };
  const passes = (res: Response) => res.headers.get("x-middleware-next") === "1";

  it.each(["microcredit-assist-score-mcas", "not-a-pid", `${A}x`, "..%2Fplatform"])(
    "I3.2 /p/%s is 404 before the platform is asked",
    async (x) => {
      const mw = await middleware();
      const res = await mw(new NextRequest(`http://q/p/${x}/qualifications`, { headers: { authorization: "Bearer person-token" } }));
      expect(res.status).toBe(404);
      expect(platformAsked).toEqual([]);
    },
  );

  it("I3.2 a pid is still decided by the platform (member passes, stranger 404)", async () => {
    const mw = await middleware();
    access = { [A]: MEMBER };
    expect(passes(await mw(new NextRequest(`http://q/p/${A}/qualifications`, { headers: { authorization: "Bearer person-token" } })))).toBe(true);
    expect((await mw(new NextRequest(`http://q/p/${B}/qualifications`, { headers: { authorization: "Bearer person-token" } }))).status).toBe(404);
  });

  it("I3.4 I18.1 the agent's token passes the door on GET and PUT of /p/{pid}/api/qualifications/{id}/extracted only", async () => {
    // The agent has no user token: the door must leave that one route to its own
    // token check, or the agent could never read or publish under /p.
    const mw = await middleware();
    for (const method of ["GET", "PUT"]) {
      const res = await mw(new NextRequest(url(A, "extracted"), { method, headers: { [HEADER]: AGENT_TOKEN } }));
      expect(passes(res), `${method} extracted with the agent token`).toBe(true);
    }
    const other = await mw(new NextRequest(url(A, "ai-card.json"), { headers: { [HEADER]: AGENT_TOKEN } }));
    expect(other.status).toBe(404);
    const post = await mw(new NextRequest(url(A, "extracted"), { method: "POST", headers: { [HEADER]: AGENT_TOKEN } }));
    expect(passes(post)).toBe(false);
  });
});
