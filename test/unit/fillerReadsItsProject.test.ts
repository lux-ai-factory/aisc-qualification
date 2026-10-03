import { describe, it, expect, vi, beforeEach } from "vitest";

// The card agent is never told whose model (LLM key) to use: it reads the project from the
// qualification it works on, so a caller cannot point a run at another project's key. What
// it reads is GET /p/{pid}/api/qualifications/:id/extracted, which carries the project of
// the database the card was found in: the
// path's pid, never anything in the query string.

const OWN_PROJECT = "a1b2c3d4-0000-4000-8000-000000000002";

const repo = { find: vi.fn(async (id: string): Promise<unknown> => ({ id, ontologyExtracted: null })) };
const door = vi.fn(async (_pid: string, _o?: { write: boolean }): Promise<unknown> => ({ db: OWN_PROJECT }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/projectDb", () => ({ projectDbForRoute: door, projectDbForService: door }));
vi.mock("@/server/repositories/QualificationRepository", () => ({
  QualificationRepository: class {
    constructor() {
      return repo;
    }
  },
  repositoryFor: async () => repo,
}));
vi.mock("@/server/services/QualificationExporter", () => ({ toExport: (q: { id: string }) => ({ id: q.id }) }));
vi.mock("@/server/services/FormService", () => ({ formService: { resolve: async () => null } }));

const ctx = (id: string) => ({ params: Promise.resolve({ project: OWN_PROJECT, id }) });
const get = async (id: string) => {
  const { GET } = await import("@/app/p/[project]/api/qualifications/[id]/extracted/route");
  return GET(new Request(`http://x/p/${OWN_PROJECT}/api/qualifications/${id}/extracted`), ctx(id));
};

beforeEach(() => {
  vi.clearAllMocks();
  door.mockResolvedValue({ db: OWN_PROJECT });
  repo.find.mockImplementation(async (id: string) => ({ id, ontologyExtracted: null }));
});

describe("the filler reads its project from the qualification", () => {
  it("the export carries the project of the database the card is in", async () => {
    const res = await get("q1");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "q1", projectId: OWN_PROJECT });
  });

  it("the project comes from the path's database, not from the request's query", async () => {
    const { GET } = await import("@/app/p/[project]/api/qualifications/[id]/extracted/route");
    const res = await GET(
      new Request(`http://x/p/${OWN_PROJECT}/api/qualifications/q1/extracted?project=b0000000-0000-4000-8000-000000000009`),
      ctx("q1"),
    );
    expect((await res.json()).projectId).toBe(OWN_PROJECT);
  });

  it("a qualification the caller may not read is still a 404", async () => {
    door.mockResolvedValueOnce(new Response("Not found", { status: 404 }));
    expect((await get("q1")).status).toBe(404);
  });
});

describe("the save starts the filler with the project and the qualification id only", () => {
  it("requestFill takes the project and the card, and posts no query", async () => {
    vi.resetModules();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal("fetch", fetchImpl);
    vi.stubEnv("AGENT_SERVICE_URL", "http://agents:8012");
    try {
      const mod = await import("@/server/services/FillerClient");
      expect(mod.requestFill.length).toBe(2);
      await mod.requestFill(OWN_PROJECT, "q1");
      expect(fetchImpl.mock.calls[0][0]).toBe(`http://agents:8012/fill/${OWN_PROJECT}/q1`);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
