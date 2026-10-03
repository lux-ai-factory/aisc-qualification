import { describe, it, expect, vi, beforeEach } from "vitest";
import { transactional } from "../support/ledgerRepo";

// Only the latest version's card may change.
// S3.3: a reviewer patch, a reset or the filler's draft aimed at an older card
//       is refused (403) before anything is written.
// S3.4: the same, aimed at the latest card, edits it in place: no new version.
//
// The platform says which version is the latest; the repository holds the
// cards. Both are replaced by fakes, so these tests pin the behaviour and not
// how the check is wired.

const PROJECT_ID = "a1b2c3d4-0000-4000-8000-000000000002";
const version = (n: number) => ({
  pid: `v${n}`, project_id: PROJECT_ID, number: n, name: "MCAS", version: "1",
  provider: null, description: null, created_at: "2026-09-23T10:00:00Z", created_by: "u",
});
const cardOf = (id: string, systemId: string) => ({
  id, systemId, projectId: PROJECT_ID, systemName: "MCAS", systemVersion: "1", company: "L",
  description: "d", targetUseCase: "u", targetUsers: "t", intendedDeployers: null,
  targetSystemTags: [], sectorTags: [], marketFormTags: [], localityTags: [],
  systemCardJson: null, ontologyExtracted: null, ontologyPatch: null,
  createdAt: new Date(), updatedAt: new Date(), answers: [], risks: [], components: [],
});
const CARDS: Record<string, ReturnType<typeof cardOf>> = {
  c1: cardOf("c1", "v1"),
  c2: cardOf("c2", "v2"),
};
const BUILT = {
  digest: "d", turtle: "t", jsonld: "{}", problems: [],
  view: { nodes: [], edges: [], counts: { nodes: 1, triples: 1 } },
};

const repo = transactional({
  find: vi.fn(async (id: string) => CARDS[id] ?? null),
  cardSummary: vi.fn(async (id: string) => CARDS[id] ?? null),
  findBySystem: vi.fn(async () => null),
  list: vi.fn(async () => Object.values(CARDS)),
  saveOntologyPatch: vi.fn(async () => ({})),
  saveOntologyExtracted: vi.fn(async () => ({})),
  saveSystemCard: vi.fn(async () => ({})),
  knowledgeGraph: vi.fn(async () => null),
  saveKnowledgeGraph: vi.fn(async () => ({})),
  create: vi.fn(async () => ({ id: "new" })),
});
const platform = {
  latestVersion: vi.fn(async () => version(2)),
  listVersions: vi.fn(async () => [version(2), version(1)]),
  createVersion: vi.fn(async () => version(3)),
  // an ai-system answer is given too, so the code reaches its own check and not a TypeError
  aiSystem: vi.fn(async () => ({
    pid: "s", project_id: PROJECT_ID,
    current: { ...version(2), frozen_at: null }, versions: [
      { ...version(2), frozen_at: null }, { ...version(1), frozen_at: "2026-09-23T10:00:00Z" },
    ],
  })),
  versionForNewCard: vi.fn(async () => version(3)),
  freeze: vi.fn(async () => version(2)),
};
const build = vi.fn(async () => BUILT);

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
// The doors of src/lib/projectDb.ts open the project's database (here the
// caller is an editor of it), and the repository is bound to that database.
vi.mock("@/lib/projectDb", () => ({
  projectDbForAction: vi.fn(async () => ({ db: {} })),
  projectDbForRoute: vi.fn(async () => ({})),
  projectDbForService: vi.fn(async () => ({})),
  projectDbPastDoor: vi.fn(async () => ({})),
}));
vi.mock("@/server/repositories/QualificationRepository", () => ({
  QualificationRepository: class {
    constructor() {
      return repo;
    }
  },
  repositoryFor: async () => repo,
}));
vi.mock("@/server/services/PlatformClient", () => ({
  PlatformClient: class {},
  platformClient: platform,
}));
vi.mock("@/server/services/OntologyClient", () => ({
  OntologyClient: { fromEnv: () => ({ build, vocabularies: async () => ({}) }) },
}));

const WRITES = [repo.saveOntologyPatch, repo.saveOntologyExtracted, repo.saveKnowledgeGraph, repo.create];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reviewer actions on the card page", () => {
  it("S3.3 a patch on the v1 card, with v2 the latest, is refused and writes nothing", async () => {
    const { patchOntologyNode } = await import("@/app/p/[project]/qualify/[id]/ontology-actions");
    const state = await patchOntologyNode(PROJECT_ID, "c1", "purpose", { label: "x" });
    expect(state.ok).toBe(false);
    if (!state.ok) expect(state.error).toMatch(/403|not the latest|kept as it was|read-only/i);
    for (const write of WRITES) expect(write).not.toHaveBeenCalled();
  });

  it("S3.3 a reset of the v1 card is refused and writes nothing", async () => {
    const { resetOntology } = await import("@/app/p/[project]/qualify/[id]/ontology-actions");
    const state = await resetOntology(PROJECT_ID, "c1");
    expect(state.ok).toBe(false);
    for (const write of WRITES) expect(write).not.toHaveBeenCalled();
  });

  it("S3.4 a patch on the latest card edits it in place and makes no version (already passing)", async () => {
    const { patchOntologyNode } = await import("@/app/p/[project]/qualify/[id]/ontology-actions");
    const state = await patchOntologyNode(PROJECT_ID, "c2", "purpose", { label: "x" });
    expect(state.ok).toBe(true);
    expect(repo.saveOntologyPatch).toHaveBeenCalledWith("c2", { purpose: { label: "x" } });
    expect(platform.createVersion).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe("the filler's draft (PUT /p/{pid}/api/qualifications/{id}/extracted)", () => {
  const put = (body: unknown) =>
    new Request("http://q/api", { method: "PUT", body: JSON.stringify(body) });

  it("S3.3 aimed at the v1 card, it is 403 and nothing is stored", async () => {
    const { PUT } = await import("@/app/p/[project]/api/qualifications/[id]/extracted/route");
    const res = await PUT(put({ techniques: [] }), { params: Promise.resolve({ project: PROJECT_ID, id: "c1" }) });
    expect(res.status).toBe(403);
    expect(repo.saveOntologyExtracted).not.toHaveBeenCalled();
  });

  it("S3.4 aimed at the latest card, it is stored in place and no version is made (already passing)", async () => {
    const { PUT } = await import("@/app/p/[project]/api/qualifications/[id]/extracted/route");
    const res = await PUT(put({ techniques: [] }), { params: Promise.resolve({ project: PROJECT_ID, id: "c2" }) });
    expect(res.status).toBe(200);
    expect(repo.saveOntologyExtracted).toHaveBeenCalledWith("c2", expect.anything());
    expect(platform.createVersion).not.toHaveBeenCalled();
  });
});
