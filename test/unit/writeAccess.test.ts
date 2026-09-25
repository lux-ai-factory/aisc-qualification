import { describe, it, expect, vi, beforeEach } from "vitest";

// API auth WP2 (2026-09-25), inventory findings 6 and 7.
//
// F6: PUT /api/qualifications/:id/extracted asked only "is the caller in the
//     project", so a viewer could replace the agent's draft. It is a write, so it
//     now takes an editor (or a platform admin, whom the platform answers as owner)
//     of the qualification's OWN project.
// F7: the card page's server actions took the project from the browser, while the
//     middleware checked the project in the URL the action was posted to. An editor
//     of project A who was only a viewer of B could write B's card through /p/A.
//     Each action now reads the project from the qualification it acts on and asks
//     for write access there; the project argument the browser sends is ignored.
//
// Written before the implementation: exports that do not exist yet are reached
// through `loose`, so tsc stays clean while the tests fail at run time.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loose = (x: unknown) => x as any;

const OWN = "a1b2c3d4-0000-4000-8000-000000000002";
const OTHER = "b0000000-0000-4000-8000-000000000009";
const editor = { role: "editor", admin: false, may_write: true };
const viewer = { role: "viewer", admin: false, may_write: false };
const stranger = { role: null, admin: false, may_write: false };
const admin = { role: "owner", admin: true, may_write: true };

// The module is faked further down for the routes and actions; its own rule is
// tested through the real module.
describe("qualificationForWriter: write access to the qualification's own project", () => {
  const deps = (access: unknown, project: string | null = OWN) => ({
    projectOf: vi.fn(async () => project),
    accessTo: vi.fn(async () => access),
  });

  it("an editor of the qualification's project may write, and is given that project", async () => {
    const mod = loose(await vi.importActual("@/server/access/qualificationAccess"));
    const d = deps(editor);
    expect(await mod.qualificationForWriter("q1", d)).toEqual({ ok: true, project: OWN });
    expect(d.accessTo).toHaveBeenCalledWith(OWN);
  });

  it("a platform admin may write", async () => {
    const mod = loose(await vi.importActual("@/server/access/qualificationAccess"));
    expect(await mod.qualificationForWriter("q1", deps(admin))).toEqual({ ok: true, project: OWN });
  });

  it("a viewer is refused with 403: they may know it exists, not change it", async () => {
    const mod = loose(await vi.importActual("@/server/access/qualificationAccess"));
    expect(await mod.qualificationForWriter("q1", deps(viewer))).toEqual({ ok: false, status: 403 });
  });

  it("a stranger, a missing qualification and a silent platform are all 404", async () => {
    const mod = loose(await vi.importActual("@/server/access/qualificationAccess"));
    expect(await mod.qualificationForWriter("q1", deps(stranger))).toEqual({ ok: false, status: 404 });
    expect(await mod.qualificationForWriter("q1", deps(editor, null))).toEqual({ ok: false, status: 404 });
    expect(await mod.qualificationForWriter("q1", deps(null))).toEqual({ ok: false, status: 404 });
  });

  it("projectForWriter answers for a project named directly", async () => {
    const mod = loose(await vi.importActual("@/server/access/qualificationAccess"));
    expect(await mod.projectForWriter(OWN, async () => editor)).toBe(true);
    expect(await mod.projectForWriter(OWN, async () => viewer)).toBe(false);
    expect(await mod.projectForWriter(OWN, async () => stranger)).toBe(false);
    // the platform did not answer: refused too, and the action can say why
    expect(await mod.projectForWriter(OWN, async () => null)).toBeNull();
  });
});

// ── the routes and actions, with every dependency faked ──────────────────────

const writer = vi.fn(async (_id: string): Promise<unknown> => ({ ok: true, project: OWN }));
const reader = vi.fn(async (_id: string): Promise<string | null> => OWN);
const projectWriter = vi.fn(async (_p: string): Promise<boolean> => true);
const repo = {
  find: vi.fn(async (_p: string, id: string) => ({ id, projectId: OWN, systemId: "v2" })),
  cardSummary: vi.fn(async (_p: string, id: string) => ({ id, projectId: OWN, systemId: "v2" })),
  saveOntologyExtracted: vi.fn(async () => ({})),
  linkComponent: vi.fn(async () => ({})),
  unlinkComponent: vi.fn(async () => ({})),
};
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
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/server/access/qualificationAccess", () => ({
  qualificationForCaller: reader,
  qualificationForWriter: writer,
  projectForWriter: projectWriter,
  qualificationProject: vi.fn(async () => OWN),
  callerAccess: vi.fn(async () => editor),
}));
vi.mock("@/server/repositories/QualificationRepository", () => ({
  QualificationRepository: class {},
  qualificationRepository: repo,
}));
vi.mock("@/server/services/OntologyService", () => ({ ontologyService: ontology }));
vi.mock("@/server/services/EngineClient", () => ({ engineClient: engine }));
vi.mock("@/server/services/cardLatest", () => ({
  NOT_LATEST: "403: not the latest",
  isLatestCard: vi.fn(async () => true),
  isLatestCardInDb: vi.fn(async () => true),
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
  writer.mockResolvedValue({ ok: true, project: OWN });
  reader.mockResolvedValue(OWN);
  projectWriter.mockResolvedValue(true);
});

describe("F6: PUT /api/qualifications/:id/extracted needs an editor of the qualification's project", () => {
  const put = () =>
    new Request("http://q/api/qualifications/q1/extracted", {
      method: "PUT",
      body: JSON.stringify({ techniques: [] }),
    });

  it("a viewer is refused with 403 and nothing is stored", async () => {
    writer.mockResolvedValueOnce({ ok: false, status: 403 });
    const { PUT } = await import("@/app/api/qualifications/[id]/extracted/route");
    const res = await PUT(put(), { params: Promise.resolve({ id: "q1" }) });
    expect(res.status).toBe(403);
    expect(repo.saveOntologyExtracted).not.toHaveBeenCalled();
  });

  it("a stranger is told 404", async () => {
    writer.mockResolvedValueOnce({ ok: false, status: 404 });
    const { PUT } = await import("@/app/api/qualifications/[id]/extracted/route");
    const res = await PUT(put(), { params: Promise.resolve({ id: "q1" }) });
    expect(res.status).toBe(404);
    expect(repo.saveOntologyExtracted).not.toHaveBeenCalled();
  });

  it("an editor stores the draft, in the qualification's own project", async () => {
    const { PUT } = await import("@/app/api/qualifications/[id]/extracted/route");
    const res = await PUT(put(), { params: Promise.resolve({ id: "q1" }) });
    expect(res.status).toBe(200);
    expect(writer).toHaveBeenCalledWith("q1");
    expect(repo.cardSummary).toHaveBeenCalledWith(OWN, "q1");
    expect(repo.saveOntologyExtracted).toHaveBeenCalledWith("q1", expect.anything());
  });
});

describe("F7: the card page's actions take the project from the qualification", () => {
  it("patchOntologyNode ignores the browser's project and writes in the qualification's own", async () => {
    const { patchOntologyNode } = await import("@/app/p/[project]/qualify/[id]/ontology-actions");
    const state = await patchOntologyNode(OTHER, "q1", "purpose", { label: "x" });
    expect(state.ok).toBe(true);
    expect(writer).toHaveBeenCalledWith("q1");
    expect(ontology.patchNode).toHaveBeenCalledWith(OWN, "q1", "purpose", { label: "x" });
  });

  it("patchOntologyNode by a viewer of the qualification's project writes nothing", async () => {
    writer.mockResolvedValueOnce({ ok: false, status: 403 });
    const { patchOntologyNode } = await import("@/app/p/[project]/qualify/[id]/ontology-actions");
    const state = await patchOntologyNode(OWN, "q1", "purpose", { label: "x" });
    expect(state.ok).toBe(false);
    if (!state.ok) expect(state.error).toMatch(/403/);
    expect(ontology.patchNode).not.toHaveBeenCalled();
  });

  it("resetOntology does the same", async () => {
    const { resetOntology } = await import("@/app/p/[project]/qualify/[id]/ontology-actions");
    expect((await resetOntology(OTHER, "q1")).ok).toBe(true);
    expect(ontology.resetPatch).toHaveBeenCalledWith(OWN, "q1");

    writer.mockResolvedValueOnce({ ok: false, status: 404 });
    ontology.resetPatch.mockClear();
    const refused = await resetOntology(OWN, "q1");
    expect(refused.ok).toBe(false);
    expect(ontology.resetPatch).not.toHaveBeenCalled();
  });

  it("loadOntology reads with the caller's read access to the qualification's own project", async () => {
    const { loadOntology } = await import("@/app/p/[project]/qualify/[id]/ontology-actions");
    expect((await loadOntology(OTHER, "q1")).ok).toBe(true);
    expect(reader).toHaveBeenCalledWith("q1");
    expect(ontology.build).toHaveBeenCalledWith(OWN, "q1");

    reader.mockResolvedValueOnce(null);
    ontology.build.mockClear();
    expect((await loadOntology(OWN, "q1")).ok).toBe(false);
    expect(ontology.build).not.toHaveBeenCalled();
  });

  it("linkComponent ignores the browser's project", async () => {
    const { linkComponent } = await import("@/app/p/[project]/qualify/[id]/component-actions");
    const state = await linkComponent(OTHER, "q1", "c1", "hasModel");
    expect(writer).toHaveBeenCalledWith("q1");
    expect(repo.cardSummary).toHaveBeenCalledWith(OWN, "q1");
    expect(engine.components).toHaveBeenCalledWith(OWN);
    expect(engine.components).not.toHaveBeenCalledWith(OTHER);
    expect(state.ok).toBe(true);
    expect(repo.linkComponent).toHaveBeenCalledWith("q1", expect.objectContaining({ componentPid: "c1" }));
  });

  it("linkComponent and unlinkComponent by a viewer write nothing", async () => {
    const { linkComponent, unlinkComponent } = await import(
      "@/app/p/[project]/qualify/[id]/component-actions"
    );
    writer.mockResolvedValue({ ok: false, status: 403 });
    const linked = await linkComponent(OWN, "q1", "c1", "hasModel");
    const unlinked = await unlinkComponent(OWN, "q1", "c1");
    expect(linked.ok).toBe(false);
    expect(unlinked.ok).toBe(false);
    if (!unlinked.ok) expect(unlinked.error).toMatch(/403/);
    expect(repo.linkComponent).not.toHaveBeenCalled();
    expect(repo.unlinkComponent).not.toHaveBeenCalled();
  });

  it("unlinkComponent writes in the qualification's own project", async () => {
    const { unlinkComponent } = await import("@/app/p/[project]/qualify/[id]/component-actions");
    const state = await unlinkComponent(OTHER, "q1", "c1");
    expect(state.ok).toBe(true);
    expect(repo.cardSummary).toHaveBeenCalledWith(OWN, "q1");
    expect(repo.unlinkComponent).toHaveBeenCalledWith("q1", "c1");
  });

  it("submitQualification checks write access to the project it is given before saving", async () => {
    const { submitQualification } = await import("@/app/p/[project]/qualify/new/actions");
    projectWriter.mockResolvedValueOnce(false);
    const state = await submitQualification(OTHER, undefined, new FormData());
    expect(projectWriter).toHaveBeenCalledWith(OTHER);
    expect(state?.error).toMatch(/403/);
    expect(createFromForm).not.toHaveBeenCalled();
  });
});
