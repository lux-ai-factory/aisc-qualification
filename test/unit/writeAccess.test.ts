import { describe, it, expect, vi, beforeEach } from "vitest";
import { transactional } from "../support/ledgerRepo";

// API auth WP2 (2026-09-25), inventory findings 6 and 7, under isolation (Q1).
//
// F6: PUT /api/qualifications/:id/extracted asked only "is the caller in the
//     project", so a viewer could replace the agent's draft. It is a write, so it
//     takes an editor (or a platform admin, whom the platform answers as owner).
//     Under isolation the route is /p/{pid}/api/qualifications/:id/extracted and the
//     card is looked up in that project's own database, after the platform has
//     said the caller may write THAT project.
// F7: the card page's server actions took the project from the browser, while the
//     middleware checked the project in the URL the action was posted to. An editor
//     of project A who was only a viewer of B could write B's card through /p/A.
//     Under isolation each action opens the database of the project it is given,
//     and only after the platform confirms the caller may write that project: a
//     viewer of B is refused, and an editor of B writes B's card as B.

const OWN = "a1b2c3d4-0000-4000-8000-000000000002";
const OTHER = "b0000000-0000-4000-8000-000000000009";
const editor = { role: "editor", admin: false, may_write: true };
const viewer = { role: "viewer", admin: false, may_write: false };
const stranger = { role: null, admin: false, may_write: false };
const admin = { role: "owner", admin: true, may_write: true };

vi.mock("@prisma/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@prisma/client")>();
  class FakePrismaClient {
    async $disconnect() {}
    async $queryRawUnsafe() {
      return [];
    }
    $use() {}
  }
  return { ...actual, PrismaClient: FakePrismaClient };
});
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const ok = (...args: unknown[]) => {
    const cb = args[args.length - 1];
    if (typeof cb === "function") (cb as (e: null, out: string, err: string) => void)(null, "", "");
    return { on: () => undefined } as unknown;
  };
  return { ...actual, execFile: ok };
});

// The door is faked further down for the routes and actions; its own rule is
// tested through the real module (the platform answers from `answer`).
describe("projectDbForAction: write access to the project the action names", () => {
  type Door = typeof import("@/lib/projectDb");
  const door = async (answer: unknown) => {
    vi.stubEnv("PROJECT_DATABASE_URL", "postgresql://q:q@postgres:5432/{database}?schema=qualification");
    vi.stubEnv("PLATFORM_URL", "http://platform:8000");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (answer === "silent") throw new Error("ECONNREFUSED");
        return new Response(JSON.stringify(answer), { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    const mod = await vi.importActual<Door>("@/lib/projectDb");
    await mod.closeProjectDatabases();
    return mod;
  };
  const afterEachDoor = () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  };

  it("an editor of the project may write, and is given that project's database", async () => {
    try {
      const mod = await door(editor);
      const d = await mod.projectDbForAction(OWN, { write: true });
      expect(d.error).toBeUndefined();
      expect(d.db).toBeDefined();
      expect(vi.mocked(fetch).mock.calls[0][0]).toBe(`http://platform:8000/authz/projects/${OWN}`);
    } finally {
      afterEachDoor();
    }
  });

  it("a platform admin may write", async () => {
    try {
      const mod = await door(admin);
      expect((await mod.projectDbForAction(OWN, { write: true })).db).toBeDefined();
    } finally {
      afterEachDoor();
    }
  });

  it("a viewer is refused with 403: they may know it exists, not change it", async () => {
    try {
      const mod = await door(viewer);
      expect(await mod.projectDbForAction(OWN, { write: true })).toEqual({
        status: 403,
        error: "403: you can read this project but not change it.",
      });
    } finally {
      afterEachDoor();
    }
  });

  it("a stranger is 404, and a project that is not a pid is 404 without asking", async () => {
    try {
      const mod = await door(stranger);
      expect(await mod.projectDbForAction(OWN, { write: true })).toEqual({ status: 404, error: "Qualification not found." });
      expect(await mod.projectDbForAction("some-slug", { write: true })).toMatchObject({ status: 404 });
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    } finally {
      afterEachDoor();
    }
  });

  it("the platform not answering is refused too, and the action can say why", async () => {
    try {
      const mod = await door("silent");
      const d = await mod.projectDbForAction(OWN, { write: true });
      expect(d).toMatchObject({ status: 503 });
      expect(d.error).toMatch(/platform/i);
      expect(d.db).toBeUndefined();
    } finally {
      afterEachDoor();
    }
  });
});

// ── the routes and actions, with every dependency faked ──────────────────────

const DB = { database: "the project's own" };
const refused = (status: 403 | 404) =>
  status === 403
    ? Response.json({ error: "403: you can read this project but not change it." }, { status: 403 })
    : new Response("Not found", { status: 404 });
const routeDoor = vi.fn(async (_pid: string, _o: { write: boolean }): Promise<unknown> => DB);
type ActionDoor = { db: unknown; error?: undefined } | { status: 403 | 404 | 503; error: string };
const actionDoor = vi.fn(async (_pid: string, _o: { write: boolean }): Promise<ActionDoor> => ({ db: DB }));
const REFUSED_403: ActionDoor = { status: 403, error: "403: you can read this project but not change it." };
const REFUSED_404: ActionDoor = { status: 404, error: "Qualification not found." };
const repo = transactional({
  find: vi.fn(async (id: string) => ({ id, systemId: "v2" })),
  cardSummary: vi.fn(async (id: string) => ({ id, systemId: "v2" })),
  // an unlink removes a link that is there (ledger phase 5: nothing linked, nothing changes)
  findLink: vi.fn(async () => ({ airoProperty: "hasModel", name: "m", componentType: "model", objectName: "", componentKey: null })),
  saveOntologyExtracted: vi.fn(async () => ({})),
  linkComponent: vi.fn(async () => ({})),
  unlinkComponent: vi.fn(async () => ({})),
});
const opened: unknown[] = [];
const BUILT = { view: { nodes: [] }, problems: [] };
const ontology = {
  build: vi.fn(async () => BUILT),
  patchNode: vi.fn(async () => BUILT),
  resetPatch: vi.fn(async () => BUILT),
};
const engine = {
  components: vi.fn(async () => [
    { pid: "c1", name: "model", component_type: "model", data: "m" },
  ]),
};
const createFromForm = vi.fn(async () => ({ id: "new" }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/projectDb", () => ({
  projectDbForRoute: routeDoor,
  projectDbForService: vi.fn(async () => DB),
  projectDbForAction: actionDoor,
}));
vi.mock("@/server/repositories/QualificationRepository", () => ({
  QualificationRepository: class {
    constructor(db: unknown) {
      opened.push(db);
      return repo;
    }
  },
  repositoryFor: async () => repo,
}));
vi.mock("@/server/services/OntologyService", () => ({ ontologyService: ontology }));
vi.mock("@/server/services/EngineClient", () => ({ engineClient: engine }));
vi.mock("@/server/services/cardLatest", () => ({
  NOT_LATEST: "403: not the latest",
  isLatestCard: vi.fn(async () => true),
  assertLatestCard: vi.fn(async () => undefined),
}));
vi.mock("@/server/services/QualificationExporter", () => ({ toExport: (q: { id: string }) => ({ id: q.id }) }));
vi.mock("@/server/services/FormService", () => ({ formService: { resolve: async () => null } }));
vi.mock("@/server/services/QualificationService", () => ({
  qualificationService: { createFromForm },
}));
vi.mock("@/server/services/FillerClient", () => ({ requestFill: vi.fn(async () => true) }));

beforeEach(() => {
  vi.clearAllMocks();
  opened.length = 0;
  routeDoor.mockResolvedValue(DB);
  actionDoor.mockResolvedValue({ db: DB });
});

describe("F6: PUT /p/{pid}/api/qualifications/:id/extracted needs an editor of the project", () => {
  const put = () =>
    new Request(`http://q/p/${OWN}/api/qualifications/q1/extracted`, {
      method: "PUT",
      body: JSON.stringify({ techniques: [] }),
    });
  const ctx = { params: Promise.resolve({ project: OWN, id: "q1" }) };

  it("a viewer is refused with 403 and nothing is stored", async () => {
    routeDoor.mockResolvedValueOnce(refused(403));
    const { PUT } = await import("@/app/p/[project]/api/qualifications/[id]/extracted/route");
    const res = await PUT(put(), ctx);
    expect(res.status).toBe(403);
    expect(repo.saveOntologyExtracted).not.toHaveBeenCalled();
  });

  it("a stranger is told 404", async () => {
    routeDoor.mockResolvedValueOnce(refused(404));
    const { PUT } = await import("@/app/p/[project]/api/qualifications/[id]/extracted/route");
    const res = await PUT(put(), ctx);
    expect(res.status).toBe(404);
    expect(repo.saveOntologyExtracted).not.toHaveBeenCalled();
  });

  it("an editor stores the draft, in the project's own database", async () => {
    const { PUT } = await import("@/app/p/[project]/api/qualifications/[id]/extracted/route");
    const res = await PUT(put(), ctx);
    expect(res.status).toBe(200);
    expect(routeDoor).toHaveBeenCalledWith(OWN, { write: true });
    expect(opened).toEqual([DB]);
    expect(repo.cardSummary).toHaveBeenCalledWith("q1");
    expect(repo.saveOntologyExtracted).toHaveBeenCalledWith("q1", expect.anything());
  });
});

describe("F7: the card page's actions open the project they name, after the platform confirms it", () => {
  it("patchOntologyNode by an editor of OTHER writes OTHER's card, as OTHER", async () => {
    const { patchOntologyNode } = await import("@/app/p/[project]/qualify/[id]/ontology-actions");
    const state = await patchOntologyNode(OTHER, "q1", "purpose", { label: "x" });
    expect(state.ok).toBe(true);
    expect(actionDoor).toHaveBeenCalledWith(OTHER, { write: true });
    // the fifth argument writes the ledger event in the save's transaction (ledger phase 5)
    expect(ontology.patchNode).toHaveBeenCalledWith(OTHER, "q1", "purpose", { label: "x" }, expect.any(Function));
  });

  it("patchOntologyNode by a viewer of the project it names writes nothing", async () => {
    actionDoor.mockResolvedValueOnce(REFUSED_403);
    const { patchOntologyNode } = await import("@/app/p/[project]/qualify/[id]/ontology-actions");
    const state = await patchOntologyNode(OTHER, "q1", "purpose", { label: "x" });
    expect(state.ok).toBe(false);
    if (!state.ok) expect(state.error).toMatch(/403/);
    expect(actionDoor).toHaveBeenCalledWith(OTHER, { write: true });
    expect(ontology.patchNode).not.toHaveBeenCalled();
  });

  it("resetOntology does the same", async () => {
    const { resetOntology } = await import("@/app/p/[project]/qualify/[id]/ontology-actions");
    expect((await resetOntology(OTHER, "q1")).ok).toBe(true);
    expect(ontology.resetPatch).toHaveBeenCalledWith(OTHER, "q1", expect.any(Function));

    actionDoor.mockResolvedValueOnce(REFUSED_404);
    ontology.resetPatch.mockClear();
    const refusedState = await resetOntology(OWN, "q1");
    expect(refusedState.ok).toBe(false);
    expect(ontology.resetPatch).not.toHaveBeenCalled();
  });

  it("loadOntology reads with the caller's read access to the project it names", async () => {
    const { loadOntology } = await import("@/app/p/[project]/qualify/[id]/ontology-actions");
    expect((await loadOntology(OTHER, "q1")).ok).toBe(true);
    expect(actionDoor).toHaveBeenCalledWith(OTHER, { write: false });
    expect(ontology.build).toHaveBeenCalledWith(OTHER, "q1");

    actionDoor.mockResolvedValueOnce(REFUSED_404);
    ontology.build.mockClear();
    expect((await loadOntology(OWN, "q1")).ok).toBe(false);
    expect(ontology.build).not.toHaveBeenCalled();
  });

  it("linkComponent works in the project it names, and asks that project's engine", async () => {
    const { linkComponent } = await import("@/app/p/[project]/qualify/[id]/component-actions");
    const state = await linkComponent(OTHER, "q1", "c1", "hasModel");
    expect(actionDoor).toHaveBeenCalledWith(OTHER, { write: true });
    expect(repo.cardSummary).toHaveBeenCalledWith("q1");
    expect(engine.components).toHaveBeenCalledWith(OTHER);
    expect(engine.components).not.toHaveBeenCalledWith(OWN);
    expect(state.ok).toBe(true);
    expect(repo.linkComponent).toHaveBeenCalledWith("q1", expect.objectContaining({ componentPid: "c1" }));
  });

  it("linkComponent and unlinkComponent by a viewer write nothing", async () => {
    const { linkComponent, unlinkComponent } = await import(
      "@/app/p/[project]/qualify/[id]/component-actions"
    );
    actionDoor.mockResolvedValue(REFUSED_403);
    const linked = await linkComponent(OWN, "q1", "c1", "hasModel");
    const unlinked = await unlinkComponent(OWN, "q1", "c1");
    expect(linked.ok).toBe(false);
    expect(unlinked.ok).toBe(false);
    if (!unlinked.ok) expect(unlinked.error).toMatch(/403/);
    expect(repo.linkComponent).not.toHaveBeenCalled();
    expect(repo.unlinkComponent).not.toHaveBeenCalled();
  });

  it("unlinkComponent writes in the project it names", async () => {
    const { unlinkComponent } = await import("@/app/p/[project]/qualify/[id]/component-actions");
    const state = await unlinkComponent(OTHER, "q1", "c1");
    expect(state.ok).toBe(true);
    expect(actionDoor).toHaveBeenCalledWith(OTHER, { write: true });
    expect(repo.cardSummary).toHaveBeenCalledWith("q1");
    expect(repo.unlinkComponent).toHaveBeenCalledWith("q1", "c1");
  });

  it("submitQualification checks write access to the project it is given before saving", async () => {
    const { submitQualification } = await import("@/app/p/[project]/qualify/new/actions");
    actionDoor.mockResolvedValueOnce(REFUSED_403);
    const state = await submitQualification(OTHER, undefined, new FormData());
    expect(actionDoor).toHaveBeenCalledWith(OTHER, { write: true });
    expect(state?.error).toMatch(/403/);
    expect(createFromForm).not.toHaveBeenCalled();
  });
});
