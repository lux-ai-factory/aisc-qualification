import { describe, it, expect, vi, beforeEach } from "vitest";

// API auth WP2 (2026-09-25), inventory finding 9. The card agent reads the form
// from GET /api/qualifications/:id/extracted and publishes its draft with PUT on
// the same path. It is a service with no user behind it, so the user check
// answered 404 and every publish failed. It now sends a token of its own
// (QUALIFICATION_AGENTS_TO_WEB_TOKEN, in X-AISC-Service-Token), accepted on
// exactly these two routes, compared in constant time and failing closed: 503
// when this app has no token set, 401 when the one sent is wrong. With the token
// the route still checks that the qualification exists and uses its own project.

const OWN = "a1b2c3d4-0000-4000-8000-000000000002";
// Split so the credential scanner (secrets.test.ts) does not read it as a real one.
const TOKEN = ["agent", "to", "web", "test", "value", "0001"].join("-");
const HEADER = "X-AISC-Service-Token";

const reader = vi.fn(async (_id: string): Promise<string | null> => null);
const writer = vi.fn(async (_id: string): Promise<unknown> => ({ ok: false, status: 404 }));
const projectOf = vi.fn(async (_id: string): Promise<string | null> => OWN);
const repo = {
  find: vi.fn(async (_p: string, id: string) => ({ id, projectId: OWN, ontologyExtracted: null })),
  cardSummary: vi.fn(async (_p: string, id: string) => ({ id, projectId: OWN, systemId: "v2" })),
  saveOntologyExtracted: vi.fn(async () => ({})),
};
const queryRaw = vi.fn(async (..._args: unknown[]) => [{ latest: true }]);
const platformLatest = vi.fn(async () => ({ pid: "v2" }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: queryRaw } }));
vi.mock("@/server/access/qualificationAccess", () => ({
  qualificationForCaller: reader,
  qualificationForWriter: writer,
  qualificationProject: projectOf,
}));
vi.mock("@/server/repositories/QualificationRepository", () => ({
  QualificationRepository: class {},
  qualificationRepository: repo,
}));
vi.mock("@/server/services/PlatformClient", () => ({
  PlatformClient: class {},
  platformClient: { latestVersion: platformLatest },
}));
vi.mock("@/server/services/OntologyService", () => ({ ontologyService: { build: vi.fn(async () => ({})) } }));
vi.mock("@/server/services/QualificationExporter", () => ({ toExport: (q: { id: string }) => ({ id: q.id }) }));
vi.mock("@/server/services/FormService", () => ({ formService: { resolve: async () => null } }));

const route = () => import("@/app/api/qualifications/[id]/extracted/route");
const ctx = (id = "q1") => ({ params: Promise.resolve({ id }) });
const get = (headers: Record<string, string> = {}) =>
  new Request("http://q/api/qualifications/q1/extracted?project=b0000000-0000-4000-8000-000000000009", { headers });
const put = (headers: Record<string, string> = {}) =>
  new Request("http://q/api/qualifications/q1/extracted", {
    method: "PUT",
    headers,
    body: JSON.stringify({ techniques: [] }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("QUALIFICATION_AGENTS_TO_WEB_TOKEN", TOKEN);
  projectOf.mockResolvedValue(OWN);
  queryRaw.mockResolvedValue([{ latest: true }]);
});

describe("the agent's token opens GET and PUT /extracted", () => {
  it("GET with the token reads the qualification's own project, without asking who the user is", async () => {
    const res = await (await route()).GET(get({ [HEADER]: TOKEN }), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).projectId).toBe(OWN);
    expect(projectOf).toHaveBeenCalledWith("q1");
    expect(reader).not.toHaveBeenCalled();
    expect(repo.find).toHaveBeenCalledWith(OWN, "q1");
  });

  it("GET with the token for a qualification that does not exist is 404", async () => {
    projectOf.mockResolvedValueOnce(null);
    const res = await (await route()).GET(get({ [HEADER]: TOKEN }), ctx());
    expect(res.status).toBe(404);
    expect(repo.find).not.toHaveBeenCalled();
  });

  it("PUT with the token stores the draft in the qualification's own project", async () => {
    const res = await (await route()).PUT(put({ [HEADER]: TOKEN }), ctx());
    expect(res.status).toBe(200);
    expect(writer).not.toHaveBeenCalled();
    expect(repo.cardSummary).toHaveBeenCalledWith(OWN, "q1");
    expect(repo.saveOntologyExtracted).toHaveBeenCalledWith("q1", expect.anything());
  });

  it("PUT with the token asks the database, not the platform, whether the card is the latest", async () => {
    // The platform's /system-versions/latest wants a user; the agent has none. The
    // database function is the rule the only-latest triggers enforce.
    queryRaw.mockResolvedValueOnce([{ latest: false }]);
    const res = await (await route()).PUT(put({ [HEADER]: TOKEN }), ctx());
    expect(res.status).toBe(403);
    expect(queryRaw).toHaveBeenCalled();
    expect(platformLatest).not.toHaveBeenCalled();
    expect(repo.saveOntologyExtracted).not.toHaveBeenCalled();
  });

  it("PUT with the token for a qualification that does not exist is 404", async () => {
    projectOf.mockResolvedValueOnce(null);
    const res = await (await route()).PUT(put({ [HEADER]: TOKEN }), ctx());
    expect(res.status).toBe(404);
    expect(repo.saveOntologyExtracted).not.toHaveBeenCalled();
  });
});

describe("the token fails closed", () => {
  it("a wrong token is 401 on both, and nothing is read or stored", async () => {
    const r = await route();
    expect((await r.GET(get({ [HEADER]: TOKEN + "x" }), ctx())).status).toBe(401);
    expect((await r.PUT(put({ [HEADER]: "wrong" }), ctx())).status).toBe(401);
    expect(repo.find).not.toHaveBeenCalled();
    expect(repo.saveOntologyExtracted).not.toHaveBeenCalled();
  });

  it("a token sent to an app that has none set is 503, even an empty one", async () => {
    vi.stubEnv("QUALIFICATION_AGENTS_TO_WEB_TOKEN", "");
    const r = await route();
    expect((await r.GET(get({ [HEADER]: TOKEN }), ctx())).status).toBe(503);
    expect((await r.PUT(put({ [HEADER]: "" }), ctx())).status).toBe(503);
    expect(repo.saveOntologyExtracted).not.toHaveBeenCalled();
  });

  it("without the header the user rules apply as before", async () => {
    const r = await route();
    expect((await r.GET(get(), ctx())).status).toBe(404);
    expect(reader).toHaveBeenCalledWith("q1");
    expect((await r.PUT(put(), ctx())).status).toBe(404);
    expect(writer).toHaveBeenCalledWith("q1");
    expect(projectOf).not.toHaveBeenCalled();
  });
});

describe("the token opens nothing else", () => {
  it("the fill route, given the token and no user, is still 404", async () => {
    const { GET } = await import("@/app/api/qualifications/[id]/fill/route");
    const res = await GET(
      new Request("http://q/api/qualifications/q1/fill", { headers: { [HEADER]: TOKEN } }),
      ctx(),
    );
    expect(res.status).toBe(404);
    expect(reader).toHaveBeenCalledWith("q1");
  });

  it("only the extracted route reads the agent's token", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const readers: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && readFileSync(path, "utf8").includes("QUALIFICATION_AGENTS_TO_WEB_TOKEN"))
          readers.push(path.replace(/\\/g, "/"));
      }
    };
    walk("src");
    expect(readers).toEqual(["src/app/api/qualifications/[id]/extracted/route.ts"]);
  });
});
