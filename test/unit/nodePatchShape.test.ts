import { describe, it, expect, vi, beforeEach } from "vitest";
import { transactional } from "../support/ledgerRepo";

// The node editor's correction comes straight from the browser. It is checked
// before anything is built or stored: a NUL in the label or the note (Postgres jsonb refuses
// U+0000), an unknown key or a wrong value type is refused with a message naming the field,
// and the repository is never reached.

const PROJECT_ID = "a1b2c3d4-0000-4000-8000-000000000002";
const card = {
  id: "c2",
  systemId: "v2",
  projectId: PROJECT_ID,
  systemName: "MCAS",
  systemVersion: "1",
  company: "L",
  description: "d",
  targetUseCase: "u",
  targetUsers: "t",
  intendedDeployers: null,
  targetSystemTags: [],
  sectorTags: [],
  marketFormTags: [],
  localityTags: [],
  systemCardJson: null,
  ontologyExtracted: null,
  ontologyPatch: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  answers: [],
  risks: [],
  components: [],
};
const version = {
  pid: "v2",
  project_id: PROJECT_ID,
  number: 2,
  name: "MCAS",
  version: "1",
  provider: null,
  description: null,
  created_at: "2026-09-23T10:00:00Z",
  created_by: "u",
};
const BUILT = {
  digest: "d",
  turtle: "t",
  jsonld: "{}",
  problems: [],
  view: { nodes: [], edges: [], counts: { nodes: 1, triples: 1 } },
};

const repo = transactional({
  find: vi.fn(async () => card),
  cardSummary: vi.fn(async () => card),
  findBySystem: vi.fn(async () => null),
  saveOntologyPatch: vi.fn(async () => ({})),
  knowledgeGraph: vi.fn(async () => null),
  saveKnowledgeGraph: vi.fn(async () => ({})),
});
const build = vi.fn(async () => BUILT);

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
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
  platformClient: {
    latestVersion: vi.fn(async () => version),
    listVersions: vi.fn(async () => [version]),
  },
}));
vi.mock("@/server/services/OntologyClient", () => ({
  OntologyClient: {
    fromEnv: () => ({ build, vocabularies: async () => ({}) }),
  },
}));

const patch = async (change: unknown) => {
  const { patchOntologyNode } =
    await import("@/app/p/[project]/qualify/[id]/ontology-actions");
  // the browser can send anything: the type is not a runtime check
  return patchOntologyNode(PROJECT_ID, "c2", "purpose", change as never);
};

beforeEach(() => vi.clearAllMocks());

describe("patchOntologyNode refuses a malformed correction before anything is written", () => {
  it.each([
    ["label", { label: "a\u0000b" }],
    ["note", { label: "a", note: "x\u0000" }],
  ])("a NUL in the %s is refused, naming the field", async (field, change) => {
    const state = await patch(change);
    expect(state.ok).toBe(false);
    if (!state.ok) {
      expect(state.error).toContain(field);
      expect(state.error).toMatch(/NUL/);
      expect(state.error).not.toMatch(/prisma|invocation/i);
    }
    expect(build).not.toHaveBeenCalled();
    expect(repo.saveOntologyPatch).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown key", { label: "a", extra: { big: 1 } }],
    ["a label that is not a string", { label: 42 }],
    ["an empty label", { label: "" }],
    ["a vair that is a number", { label: "a", vair: 7 }],
    ["a termNotApplicable that is a string", { termNotApplicable: "yes" }],
    ["a label longer than the cap", { label: "x".repeat(501) }],
    ["a change that is not an object", "label"],
  ])("%s is refused", async (_what, change) => {
    const state = await patch(change);
    expect(state.ok).toBe(false);
    expect(build).not.toHaveBeenCalled();
    expect(repo.saveOntologyPatch).not.toHaveBeenCalled();
  });

  it.each([
    [
      "the editor's full shape",
      { label: "Scorer", vair: null, termNotApplicable: true, note: "n" },
    ],
    ["a term", { label: "Scorer", vair: "MachineLearning" }],
    ["an empty change (revert)", {}],
  ])("%s is accepted", async (_what, change) => {
    const state = await patch(change);
    expect(state.ok).toBe(true);
    expect(build).toHaveBeenCalled();
  });
});

describe("the node id", () => {
  it("a NUL in the node id is refused before anything is written", async () => {
    const { patchOntologyNode } =
      await import("@/app/p/[project]/qualify/[id]/ontology-actions");
    const state = await patchOntologyNode(PROJECT_ID, "c2", "pur\u0000pose", {
      label: "a",
    });
    expect(state.ok).toBe(false);
    expect(repo.saveOntologyPatch).not.toHaveBeenCalled();
  });
});
