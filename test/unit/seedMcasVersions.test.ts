import { describe, it, expect, vi, afterEach } from "vitest";
import * as seed from "../../scripts/seed_mcas.mjs";

// The MCAS seed makes card version 1 through
// the platform's POST /projects/{project}/system-versions, and only when it is
// about to write the card: a project that already has its card gets no version.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loose = (x: unknown) => x as any;
const PROJECT_ID = "01399e17-4b01-4be9-997a-7f5e3574ab22";
const V1 = { pid: "5f1b0000-0000-4000-8000-000000000001", project_id: PROJECT_ID, number: 1 };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function fakePrisma(existing: { id: string } | null) {
  return {
    qualification: {
      findUnique: vi.fn(async () => existing),
      delete: vi.fn(async () => ({})),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: args.data.id, systemName: args.data.systemName,
      })),
    },
  };
}

describe("seed_mcas and card versions", () => {
  it("S3.5 names MCAS's version with one POST to /system-versions", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => V1 });

    const found = await seed.systemForProject("mcas", {
      platformUrl: "http://platform:8000", fetchImpl,
    });

    expect(found).toEqual({ projectId: PROJECT_ID, systemId: V1.pid });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://platform:8000/projects/mcas/system-versions");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({
      name: "MicroCredit Assist Score (MCAS)",
      version: "v1.2.0",
      provider: "Creditum AI SARL (Luxembourg)",
    });
  });

  it("S3.5 there is nothing to freeze any more", () => {
    expect(loose(seed).freezeForCard).toBeUndefined();
  });

  it("S3.5 a project that already has its card gets no version (already passing)", async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);
    vi.stubEnv("PLATFORM_URL", "http://platform:8000");
    const prisma = fakePrisma({ id: seed.MCAS_ID });

    await seed.seedMcas(prisma as never, { project: "mcas" });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(prisma.qualification.create).not.toHaveBeenCalled();
  });

  it("S3.5 an empty project gets v1 and the card points at it, with one platform call", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => V1 });
    vi.stubGlobal("fetch", fetchImpl);
    vi.stubEnv("PLATFORM_URL", "http://platform:8000");
    const prisma = fakePrisma(null);

    await seed.seedMcas(prisma as never, { project: "mcas" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe("http://platform:8000/projects/mcas/system-versions");
    const data = prisma.qualification.create.mock.calls[0][0].data;
    // the seed writes into the project's own database; the card names no project
    expect(data).toMatchObject({ systemId: V1.pid });
    expect(data).not.toHaveProperty("projectId");
  });
});
