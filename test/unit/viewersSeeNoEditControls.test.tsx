import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";

// A project viewer may read the AI card but not change it. The app asks the platform
// who the caller is and, for a viewer, offers no way to change the card: no
// "Update the answers" link, no "Let AI suggest additions", no node editing, and the
// edit page shows no form, only a line saying the person can read this project.

const PROJECT = "a1b2c3d4-0000-4000-8000-000000000002";
const m = vi.hoisted(() => ({
  access: null as unknown,
  listVersions: vi.fn(),
  startingPoint: vi.fn(),
}));

const viewer = () => ({
  ok: true, pid: PROJECT, slug: PROJECT, role: "viewer", admin: false, mayWrite: false,
});
const editor = () => ({
  ok: true, pid: PROJECT, slug: PROJECT, role: "editor", admin: false, mayWrite: true,
});

const card = {
  id: "c3",
  systemId: "v3",
  systemName: "MCAS",
  systemVersion: "1.2.0",
  company: "L",
  description: "d",
  targetUseCase: "u",
  targetUsers: "t",
  intendedDeployers: null,
  targetSystemTags: [],
  sectorTags: [],
  marketFormTags: [],
  localityTags: [],
  questionnaireVersionId: null,
  createdAt: new Date("2026-09-23T10:00:00Z"),
  revision: 1,
  answers: [],
  risks: [],
  systemComponents: [],
};
const repo = {
  find: vi.fn(async (id: string) => (id === "c3" ? card : null)),
  cardRefs: vi.fn(async () => [{ id: "c3", systemId: "v3" }]),
  transaction: vi.fn(async (fn: (r: unknown, tx: unknown) => unknown) => fn(repo, {})),
};

vi.mock("@/lib/projectDb", async (orig) => ({
  ...(await orig<typeof import("@/lib/projectDb")>()),
  callerAccess: async () => m.access,
  projectDbPastDoor: async () => ({}),
  projectDbForAction: async () => ({ db: {} }),
  projectDbForRoute: async () => ({}),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/vendor/aisc-ledger/emit", async (orig) => ({
  ...(await orig<typeof import("@/vendor/aisc-ledger/emit")>()),
  emitEvent: vi.fn(async () => null),
  isServerAction: async () => false,
}));
vi.mock("@/server/repositories/QualificationRepository", () => ({
  QualificationRepository: class {},
  repositoryFor: async () => repo,
}));
vi.mock("@/server/services/PlatformClient", () => ({
  PlatformClient: class {},
  platformClient: { listVersions: m.listVersions },
}));
vi.mock("@/server/services/OntologyService", () => ({
  ontologyService: {
    build: async () => ({ view: { system: null, rows: [], chains: [] }, problems: [] }),
  },
}));
vi.mock("@/server/services/OntologyClient", () => ({
  OntologyClient: { fromEnv: () => ({ vocabularies: async () => ({}) }) },
}));
vi.mock("@/server/services/QuestionnaireService", () => ({
  QuestionnaireService: class {},
  questionnairesFor: async () => ({
    resolve: async () => null,
    latestVersion: async () => null,
  }),
  questionnairesOn: () => ({
    resolve: async () => null,
    latestVersion: async () => null,
    chooserOptions: async () => [],
    library: async () => [{ ...libraryRow, questionnaireId: "acme-q" }],
  }),
  questionnaireResolverFor: async () => ({ resolve: async () => null }),
}));
const libraryRow = {
  name: "Acme questions", description: null, version: 2, questionCount: 3, origin: "builder",
  builtin: false, isDefault: false, updates: 0, savedBy: "u", savedAt: "2026-09-23T10:00:00Z",
  retiredAt: null,
};
vi.mock("@/server/services/QuestionSetService", () => ({
  questionSetsOn: () => ({ list: async () => [{ ...libraryRow, setId: "acme" }] }),
}));
vi.mock("@/app/p/[project]/RetireButton", () => ({
  default: function RetireButton() {
    return null;
  },
}));
vi.mock("@/app/p/[project]/questionnaires/actions", () => ({ retireQuestionnaire: vi.fn() }));
vi.mock("@/app/p/[project]/question-sets/actions", () => ({ retireQuestionSet: vi.fn() }));
vi.mock("@/server/services/EngineClient", () => ({
  engineClient: { components: async () => [] },
}));
vi.mock("@/app/p/[project]/qualify/new/QualifyForm", () => ({
  default: function QualifyForm() {
    return null;
  },
}));
vi.mock("@/app/p/[project]/system/edit/FormChooser", () => ({
  default: function FormChooser() {
    return null;
  },
}));

/** Every element in the tree, props included (the card page passes parts as props). */
function elements(node: unknown, seen = new Set<unknown>()): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((n) => elements(n, seen));
  if (!isValidElement(node) || seen.has(node)) return [];
  seen.add(node);
  const el = node as ReactElement<Record<string, unknown>>;
  return [el, ...Object.values(el.props ?? {}).flatMap((p) => elements(p as ReactNode, seen))];
}
const named = (tree: unknown, name: string) =>
  elements(tree).filter((e) => typeof e.type !== "string" && (e.type as { name?: string })?.name === name);
const text = (tree: unknown): string =>
  elements(tree)
    .flatMap((e) => {
      const c = e.props?.children;
      return (Array.isArray(c) ? c : [c]).filter((x) => typeof x === "string");
    })
    .join(" ");

async function cardPage() {
  const Page = (await import("@/app/p/[project]/qualify/[id]/page")).default;
  return Page({ params: Promise.resolve({ project: PROJECT, id: "c3" }) });
}
async function editPage() {
  const Page = (await import("@/app/p/[project]/system/edit/page")).default;
  return Page({
    params: Promise.resolve({ project: PROJECT }),
    searchParams: Promise.resolve({}),
  } as never);
}
const editLinks = (tree: unknown) =>
  elements(tree).filter((e) => String(e.props?.href ?? "").endsWith("/system/edit"));

afterEach(() => vi.unstubAllEnvs());

beforeEach(() => {
  vi.clearAllMocks();
  m.listVersions.mockResolvedValue([
    {
      pid: "v3", project_id: PROJECT, number: 3, name: "MCAS", version: "1.2.0",
      provider: null, description: null, created_at: "2026-09-23T10:00:00Z", created_by: "u",
    },
  ]);
});

describe("a viewer on the card page", () => {
  it("an editor gets the Update the answers link", async () => {
    m.access = editor();
    expect(editLinks(await cardPage()).length).toBeGreaterThan(0);
  });

  it("a viewer gets no Update the answers link", async () => {
    m.access = viewer();
    expect(editLinks(await cardPage()), "the viewer is offered the edit form").toEqual([]);
  });

  it("an editor is offered Let AI suggest additions where the install turns AI actions on", async () => {
    vi.stubEnv("AISC_AI_ACTIONS", "on");
    m.access = editor();
    expect(named(await cardPage(), "FillStatus").length).toBe(1);
  });

  it("an editor is not offered Let AI suggest additions where AI actions are off", async () => {
    vi.stubEnv("AISC_AI_ACTIONS", "");
    m.access = editor();
    expect(named(await cardPage(), "FillStatus"), "the AI run is offered with AI actions off").toEqual([]);
  });

  it("a viewer is not offered Let AI suggest additions", async () => {
    vi.stubEnv("AISC_AI_ACTIONS", "on");
    m.access = viewer();
    expect(named(await cardPage(), "FillStatus"), "the viewer is offered the AI run").toEqual([]);
  });

  it("a viewer gets the AI card read-only, with no node editing", async () => {
    m.access = viewer();
    const views = named(await cardPage(), "OntologyView");
    expect(views.length).toBe(1);
    expect(views[0].props.readOnly, "the viewer can edit nodes").toBe(true);
  });
});

describe("a viewer on the edit page", () => {
  it("shows no form to a viewer and says they can read this project", async () => {
    m.access = viewer();
    const tree = await editPage();
    expect(named(tree, "QualifyForm"), "the viewer is given the card form").toEqual([]);
    expect(named(tree, "FormChooser"), "the viewer is asked to pick a questionnaire to fill").toEqual([]);
    expect(text(tree)).toMatch(/can read this project/i);
  });
});

async function libraryPage(path: "questionnaires" | "question-sets") {
  const Page = (await import(`@/app/p/[project]/${path}/page`)).default;
  return Page({
    params: Promise.resolve({ project: PROJECT }),
    searchParams: Promise.resolve({}),
  } as never);
}
/** Links that lead to a page that changes the library: new, import, copy, edit. */
const writeLinks = (tree: unknown) =>
  elements(tree).filter((e) => /\/(new|import|edit)(\?|$)/.test(String(e.props?.href ?? "")));

describe("a viewer on the questionnaires and question bank pages", () => {
  for (const path of ["questionnaires", "question-sets"] as const) {
    it(`an editor gets Archive and the edit links on ${path}`, async () => {
      m.access = editor();
      const tree = await libraryPage(path);
      expect(named(tree, "RetireButton").length).toBe(1);
      expect(writeLinks(tree).length).toBeGreaterThan(0);
    });

    it(`a viewer gets no Archive and no edit links on ${path}, and is told they can read`, async () => {
      m.access = viewer();
      const tree = await libraryPage(path);
      expect(named(tree, "RetireButton"), "the viewer is offered Archive").toEqual([]);
      expect(
        writeLinks(tree).map((e) => e.props.href),
        "the viewer is offered a page that changes the library",
      ).toEqual([]);
      expect(text(tree)).toMatch(/can read this project/i);
    });
  }
});

describe("a viewer on the versions list and the system page", () => {
  async function versionsPage() {
    const { qualificationService } = await import("@/server/services/QualificationService");
    vi.spyOn(qualificationService, "list").mockResolvedValue([] as never);
    vi.spyOn(qualificationService, "versions").mockResolvedValue([] as never);
    const Page = (await import("@/app/p/[project]/qualifications/page")).default;
    return Page({ params: Promise.resolve({ project: PROJECT }) });
  }
  async function systemPageWithDrift() {
    const { qualificationService } = await import("@/server/services/QualificationService");
    vi.spyOn(qualificationService, "versions").mockResolvedValue([{ pid: "v3", number: 3 }] as never);
    vi.spyOn(qualificationService, "currentCardId").mockResolvedValue("c3");
    // the card links a component the engine no longer has: the page offers the next version
    vi.spyOn(qualificationService, "get").mockResolvedValue({
      ...card,
      components: [{ componentPid: "gone", name: "Old model", componentType: "model", airoProperty: "x" }],
    } as never);
    const Page = (await import("@/app/p/[project]/system/page")).default;
    return Page({ params: Promise.resolve({ project: PROJECT }) });
  }
  /** Every element in a rendered tree, client components' own output included. */
  const deepEditLinks = async (tree: unknown) => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    return renderToStaticMarkup(tree as ReactElement).match(/href="[^"]*\/system\/edit"/g) ?? [];
  };

  it("an editor gets a way to the card form on the versions list", async () => {
    m.access = editor();
    expect((await deepEditLinks(await versionsPage())).length).toBeGreaterThan(0);
  });

  it("a viewer gets no way to the card form on the versions list", async () => {
    m.access = viewer();
    expect(await deepEditLinks(await versionsPage()), "the viewer is offered the edit form").toEqual([]);
  });

  it("an editor whose card's components changed is offered the next version", async () => {
    m.access = editor();
    expect((await deepEditLinks(await systemPageWithDrift())).length).toBeGreaterThan(0);
  });

  it("a viewer whose card's components changed is not offered the next version", async () => {
    m.access = viewer();
    expect(await deepEditLinks(await systemPageWithDrift()), "the viewer is offered the edit form").toEqual([]);
  });
});
