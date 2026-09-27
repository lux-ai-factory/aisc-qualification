import { describe, it, expect, vi, beforeEach } from "vitest";

// LLM keys (2026-09-25). The card agent is never told a project: it reads the
// project from the qualification it works on, so a caller cannot point a run
// at another project's key. What it reads is GET /api/qualifications/:id/extracted,
// which therefore carries the qualification's own project id.

const OWN_PROJECT = "a1b2c3d4-0000-4000-8000-000000000002";

const repo = { find: vi.fn(async (_p: string, id: string) => ({ id, projectId: OWN_PROJECT, ontologyExtracted: null })) };
const access = vi.fn(async (_id: string): Promise<string | null> => OWN_PROJECT);

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/server/repositories/QualificationRepository", () => ({
  QualificationRepository: class {},
  qualificationRepository: repo,
}));
vi.mock("@/server/services/QualificationExporter", () => ({ toExport: (q: { id: string }) => ({ id: q.id }) }));
vi.mock("@/server/services/FormService", () => ({ formService: { resolve: async () => null } }));
vi.mock("@/server/access/qualificationAccess", () => ({ qualificationForCaller: access }));

const get = async (id: string) => {
  const { GET } = await import("@/app/api/qualifications/[id]/extracted/route");
  return GET(new Request(`http://x/api/qualifications/${id}/extracted`), { params: Promise.resolve({ id }) });
};

beforeEach(() => vi.clearAllMocks());

describe("the filler reads its project from the qualification", () => {
  it("the export carries the qualification's own project id", async () => {
    const res = await get("q1");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "q1", projectId: OWN_PROJECT });
  });

  it("the project comes from the qualification, not from the request", async () => {
    const { GET } = await import("@/app/api/qualifications/[id]/extracted/route");
    const res = await GET(
      new Request("http://x/api/qualifications/q1/extracted?project=b0000000-0000-4000-8000-000000000009"),
      { params: Promise.resolve({ id: "q1" }) },
    );
    expect((await res.json()).projectId).toBe(OWN_PROJECT);
  });

  it("a qualification the caller may not read is still a 404", async () => {
    access.mockResolvedValueOnce(null);
    expect((await get("q1")).status).toBe(404);
  });
});

describe("the save starts the filler with the qualification id only", () => {
  it("requestFill takes one argument and posts no query", async () => {
    vi.resetModules();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal("fetch", fetchImpl);
    vi.stubEnv("AGENT_SERVICE_URL", "http://agents:8012");
    try {
      const mod = await import("@/server/services/FillerClient");
      expect(mod.requestFill.length).toBe(1);
      await mod.requestFill("q1");
      expect(fetchImpl.mock.calls[0][0]).toBe("http://agents:8012/fill/q1");
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
