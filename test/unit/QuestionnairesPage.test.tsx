// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { loadSrc, questionnaireVersion, seededQuestion, setQuestion } from "../support/forms";

// The questionnaires page /p/[project]/questionnaires (two-level forms,
// docs/superpowers/two-level-forms-2026-09-25/01-spec.md, T34 and T63), rendered as the server
// component it is with the services stood in for. Replaces test/unit/FormsPage.test.tsx (spec
// 8.2): R44 "no Set as default" and R48 "install-wide, only the prefix differs" carried over; the
// R58 actions changed (T34).
//
// Choices made here where the spec is silent (recorded in 02-tests.md):
//   the page takes { params, searchParams } with searchParams { retired?: string };
//   the rows come from questionnaireService.library({ retired }) in its order (the service orders them);
//   "update available" is shown for a row whose `updates` is at least 1. The stand-ins below are
//   consistent, so a page that instead computes T26 from latestVersion() and
//   questionSetService.groups() gets the same answer;
//   "Saved by" reads "<savedBy>, <YYYY-MM-DD of savedAt in UTC>" (T20's rule), "Retired" the
//   YYYY-MM-DD of retiredAt;
//   a retired row's actions are "Export" and "Export self-contained" only (T35: it leaves
//   "Start from"; it cannot be edited or retired again).

const PAGE = "app/p/[project]/questionnaires/page.tsx";

const { questionnaireService, questionSetService, callerAccess } = vi.hoisted(() => ({
  questionnaireService: {
    library: vi.fn(),
    latestVersion: vi.fn(),
    resolve: vi.fn(),
    chooserOptions: vi.fn(),
  },
  questionSetService: { groups: vi.fn(), list: vi.fn() },
  callerAccess: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/services/QuestionnaireService", () => ({ QuestionnaireService: class {}, questionnaireService }));
vi.mock("@/server/services/QuestionSetService", () => ({ QuestionSetService: class {}, questionSetService }));
vi.mock("@/server/access/qualificationAccess", () => ({ callerAccess }));
vi.mock("@/app/p/[project]/questionnaires/actions", () => ({
  saveQuestionnaire: vi.fn(),
  useQuestionnaireOnce: vi.fn(),
  retireQuestionnaire: vi.fn(),
}));

const row = (over: Record<string, unknown>) => ({
  description: "",
  origin: "builder",
  builtin: false,
  isDefault: false,
  savedBy: "alice",
  savedAt: "2026-09-24T23:30:00.000Z",
  retiredAt: null,
  updates: 0,
  ...over,
});

const ROWS = [
  row({
    questionnaireId: "annex-iv-default", name: "Annex IV default", origin: "builtin", builtin: true, isDefault: true,
    versionId: "annex-iv-default-v1", version: 1, questionCount: 14, savedBy: "system", savedAt: "2026-09-25T08:00:00.000Z",
  }),
  row({ questionnaireId: "acme ai", name: "Acme AI policy", origin: "import", versionId: "acme-ai-v3", version: 3, questionCount: 2, updates: 1 }),
  row({ questionnaireId: "zeta", name: "Zeta", versionId: "zeta-v1", version: 1, questionCount: 1 }),
];
const RETIRED = [
  row({
    questionnaireId: "old", name: "Old review", versionId: "old-v2", version: 2, questionCount: 4,
    retiredAt: "2026-09-20T23:59:00.000Z",
  }),
];

// Consistent with ROWS: acme's latest pins q3 to acme-v1, and acme's set is at v2 with q3 reworded.
const acmeQ3v1 = setQuestion("acme", "q3", { text: "Old wording?", setVersionId: "acme-v1", setVersionNumber: 1 });
const acmeQ3v2 = setQuestion("acme", "q3", { text: "New wording?", setVersionId: "acme-v2", setVersionNumber: 2 });
const zetaQ1 = setQuestion("zeta", "q1", { setName: "Zeta", setVersionId: "zeta-v1" });
const GROUPS = [
  { setId: "annex-iv", setName: "Annex IV", versionId: "annex-iv-v1", versionNumber: 1, retired: false, questions: [seededQuestion("1a")] },
  { setId: "acme", setName: "Acme AI policy", versionId: "acme-v2", versionNumber: 2, retired: false, questions: [acmeQ3v2] },
  { setId: "zeta", setName: "Zeta", versionId: "zeta-v1", versionNumber: 1, retired: false, questions: [zetaQ1] },
];
const LATEST: Record<string, unknown> = {
  "annex-iv-default": null,
  "acme ai": questionnaireVersion({ questionnaireId: "acme ai", versionId: "acme-ai-v3", versionNumber: 3, questions: [acmeQ3v1] }),
  zeta: questionnaireVersion({ questionnaireId: "zeta", questionnaireName: "Zeta", versionId: "zeta-v1", questions: [zetaQ1] }),
};

async function mount(project: string, search: Record<string, string> = {}) {
  const { default: QuestionnairesPage } = await loadSrc(PAGE);
  return render(
    await QuestionnairesPage({ params: Promise.resolve({ project }), searchParams: Promise.resolve(search) } as never),
  );
}

const rowOf = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;
const actionNames = (el: HTMLElement) =>
  [...el.querySelectorAll("a, button")].map((x) => x.textContent?.trim());
const hrefOf = (el: HTMLElement, name: string) =>
  (within(el).getByRole("link", { name }) as HTMLAnchorElement).getAttribute("href");

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  questionnaireService.library.mockImplementation(async (opts?: { retired?: boolean }) => (opts?.retired ? RETIRED : ROWS));
  questionnaireService.latestVersion.mockImplementation(async (id: string) => {
    const { defaultVersionLiteral } = await import("../support/forms");
    return id === "annex-iv-default" ? defaultVersionLiteral() : (LATEST[id] ?? null);
  });
  questionSetService.groups.mockResolvedValue(GROUPS);
  callerAccess.mockResolvedValue({ role: "editor", admin: false, may_write: true });
});

describe("the questionnaires page (T34)", () => {
  it("T34 T32 is a --form page headed Questionnaires, with the exact intro", async () => {
    const { container } = await mount("a");
    expect(container.querySelector("main")?.className).toBe("qualify-page qualify-page--form qf-forms-page");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Questionnaires");
    const intro = container.querySelector("header p")?.textContent ?? "";
    expect(intro).toContain(
      "A questionnaire is what an AI card is filled with. Every project on this install sees the same questionnaires. A new AI card starts with the Annex IV default.",
    );
  });

  it("T34 the header links: + New questionnaire (primary), Import questionnaire and Question sets (ghost)", async () => {
    const { container } = await mount("a");
    const header = container.querySelector("header") as HTMLElement;
    const make = within(header).getByRole("link", { name: "+ New questionnaire" });
    const imp = within(header).getByRole("link", { name: "Import questionnaire" });
    const sets = within(header).getByRole("link", { name: "Question sets" });
    expect(make.getAttribute("href")).toBe("/p/a/questionnaires/new");
    expect(imp.getAttribute("href")).toBe("/p/a/questionnaires/import");
    expect(sets.getAttribute("href")).toBe("/p/a/question-sets");
    expect(make.classList.contains("ghost")).toBe(false);
    expect(imp.classList.contains("ghost")).toBe(true);
    expect(sets.classList.contains("ghost")).toBe(true);
  });

  it("T34 the table's columns are Questionnaire, Version, Questions, Made by, Saved by and a hidden Actions", async () => {
    const { container } = await mount("a");
    const table = container.querySelector("table.qf-forms-table") as HTMLElement;
    expect(table).toBeTruthy();
    const ths = [...table.querySelectorAll("thead th")];
    expect(ths.map((th) => th.textContent)).toEqual(["Questionnaire", "Version", "Questions", "Made by", "Saved by", "Actions"]);
    expect(ths[5].querySelector(".qf-sr")?.textContent).toBe("Actions");
  });

  it("T34 the rows: Annex IV default first with the default tag, then by name; version, count and who saved it when", async () => {
    const { container } = await mount("a");
    const names = [...container.querySelectorAll("tbody tr")].map((tr) => tr.querySelector("strong")?.textContent);
    expect(names).toEqual(["Annex IV default", "Acme AI policy", "Zeta"]);
    const tags = [...container.querySelectorAll("span.qf-tag.qf-tag--default")];
    expect(tags.map((t) => t.textContent)).toEqual(["default"]);
    expect(rowOf("Annex IV default").contains(tags[0])).toBe(true);
    const acme = rowOf("Acme AI policy");
    expect(acme.textContent).toContain("v3");
    expect(acme.textContent).toContain("alice, 2026-09-24");
    expect(rowOf("Annex IV default").textContent).toContain("system, 2026-09-25");
  });

  it('T34 a row whose latest version has an update carries "update available"; the others do not', async () => {
    await mount("a");
    const notice = (name: string) =>
      [...rowOf(name).querySelectorAll("span.qf-tag.qf-tag--notice")].map((t) => t.textContent);
    expect(notice("Acme AI policy")).toEqual(["update available"]);
    expect(notice("Zeta")).toEqual([]);
    expect(notice("Annex IV default")).toEqual([]);
  });

  it("T34 each row's actions, in order: Start from, Edit (not builtin), Export, Export self-contained, Retire (not builtin)", async () => {
    await mount("a");
    expect(actionNames(rowOf("Annex IV default"))).toEqual(["Start from", "Export", "Export self-contained"]);
    expect(actionNames(rowOf("Acme AI policy"))).toEqual(["Start from", "Edit", "Export", "Export self-contained", "Retire"]);
  });

  it("T34 the action links point at the builder, the edit page and the exact latest version's export", async () => {
    await mount("a");
    const acme = rowOf("Acme AI policy");
    expect(hrefOf(acme, "Start from")).toBe("/p/a/questionnaires/new?from=acme%20ai");
    expect(hrefOf(acme, "Edit")).toBe("/p/a/questionnaires/acme%20ai/edit");
    expect(hrefOf(acme, "Export")).toBe("/p/a/questionnaires/acme%20ai/export?format=json&version=3");
    expect(hrefOf(acme, "Export self-contained")).toBe(
      "/p/a/questionnaires/acme%20ai/export?format=json&version=3&bundle=self-contained",
    );
    const annex = rowOf("Annex IV default");
    expect(hrefOf(annex, "Export")).toBe("/p/a/questionnaires/annex-iv-default/export?format=json&version=1");
  });

  it("T34 the export links carry the base path, as the card page's do (06 R58)", async () => {
    vi.stubEnv("NEXT_BASE_PATH", "/qualification");
    try {
      await mount("a");
      expect(hrefOf(rowOf("Zeta"), "Export")).toBe("/qualification/p/a/questionnaires/zeta/export?format=json&version=1");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("T34 R44 an administrator sees no Set as default anywhere", async () => {
    callerAccess.mockResolvedValue({ role: "owner", admin: true, may_write: true });
    await mount("a");
    expect(screen.queryAllByRole("button", { name: /set as default/i })).toEqual([]);
    expect(screen.queryAllByRole("link", { name: /set as default/i })).toEqual([]);
    expect(document.body.textContent).not.toMatch(/Set as default/i);
  });

  it("T34 lists the current questionnaires by default and links to the retired ones", async () => {
    await mount("a");
    expect(questionnaireService.library).toHaveBeenCalledWith({ retired: false });
    const toggle = screen.getByRole("link", { name: "Show retired questionnaires" });
    expect(toggle.getAttribute("href")).toBe("/p/a/questionnaires?retired=1");
    expect(document.body.textContent).not.toContain("Old review");
  });

  it("T34 ?retired=1 lists only retired ones, with a Retired column and only the export actions", async () => {
    const { container } = await mount("a", { retired: "1" });
    expect(questionnaireService.library).toHaveBeenCalledWith({ retired: true });
    const ths = [...container.querySelectorAll("thead th")].map((th) => th.textContent);
    expect(ths).toContain("Retired");
    expect(ths).not.toContain("Saved by");
    const names = [...container.querySelectorAll("tbody tr")].map((tr) => tr.querySelector("strong")?.textContent);
    expect(names).toEqual(["Old review"]);
    const old = rowOf("Old review");
    expect(old.textContent).toContain("2026-09-20");
    expect(actionNames(old)).toEqual(["Export", "Export self-contained"]);
    expect(screen.getByRole("link", { name: "Show current questionnaires" }).getAttribute("href")).toBe("/p/a/questionnaires");
  });
});

describe("questionnaires are install-wide (T63, 06 R48)", () => {
  it("T63 projects a and b see the same rows in the same order; only the /p/<project>/ prefix differs", async () => {
    const a = await mount("a");
    const rowsA = [...a.container.querySelectorAll("tbody tr")].map((r) => r.textContent);
    const hrefsA = [...a.container.querySelectorAll("a")].map((l) => l.getAttribute("href"));
    cleanup();
    const b = await mount("b");
    const rowsB = [...b.container.querySelectorAll("tbody tr")].map((r) => r.textContent);
    const hrefsB = [...b.container.querySelectorAll("a")].map((l) => l.getAttribute("href"));
    expect(rowsB).toEqual(rowsA);
    expect(hrefsA.every((h) => h!.startsWith("/p/a/"))).toBe(true);
    expect(hrefsB.map((h) => h!.replace(/^\/p\/b\//, "/p/a/"))).toEqual(hrefsA);
    // the service is never told the project
    for (const call of questionnaireService.library.mock.calls) expect(call).toEqual([{ retired: false }]);
    for (const call of questionSetService.groups.mock.calls) expect(call).toEqual([]);
  });
});
