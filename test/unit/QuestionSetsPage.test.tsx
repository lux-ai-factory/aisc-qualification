// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { loadSrc } from "../support/forms";

// The question sets page /p/[project]/question-sets (two-level forms,
// docs/superpowers/two-level-forms-2026-09-25/01-spec.md, T20, T63), rendered as the server
// component it is with questionSetService mocked, as FormsPage.test.tsx did for the old library.
// The rows are what questionSetService.list({retired}) returns (SetListRow, in its order: Annex IV
// first, then by name ignoring case, T45). Loaded at run time so a missing page fails each test.

const { questionSetService, retireQuestionSet, saveQuestionSet } = vi.hoisted(() => ({
  questionSetService: { list: vi.fn(), groups: vi.fn() },
  retireQuestionSet: vi.fn(),
  saveQuestionSet: vi.fn(),
}));

// The project doors let these calls through: which project's database a forms page, action or
// route opens, and who may, is pinned by isolationForms.test.ts.
vi.mock("@/lib/projectDb", () => ({
  projectDbPastDoor: async () => ({}),
  projectDbForAction: async () => ({ db: {} }),
  projectDbForRoute: async () => ({}),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/server/services/QuestionSetService", () => ({ QuestionSetService: class {}, questionSetService, questionSetsOn: () => questionSetService }));
vi.mock("@/app/p/[project]/question-sets/actions", () => ({ saveQuestionSet, retireQuestionSet }));

const row = (over: Record<string, unknown>) => ({
  description: "",
  origin: "builder",
  builtin: false,
  retiredAt: null,
  ...over,
});

// savedAt 2026-09-24T23:30Z: 2026-09-24 in UTC, 2026-09-25 east of Greenwich. The page reads UTC.
const CURRENT = [
  row({ setId: "annex-iv", name: "Annex IV", origin: "builtin", builtin: true, versionId: "annex-iv-v1", version: 1, questionCount: 14, savedBy: "system", savedAt: "2026-09-25T08:00:00.000Z" }),
  row({ setId: "acme ai", name: "Acme AI policy", origin: "import", versionId: "acme-v3", version: 3, questionCount: 18, savedBy: "alice", savedAt: "2026-09-24T23:30:00.000Z" }),
  row({ setId: "zeta", name: "Zeta", versionId: "zeta-v1", version: 1, questionCount: 1, savedBy: "bob", savedAt: "2026-09-20T10:00:00.000Z" }),
];
const RETIRED = [
  row({ setId: "old", name: "Old policy", versionId: "old-v2", version: 2, questionCount: 4, savedBy: "carol", savedAt: "2026-09-01T10:00:00.000Z", retiredAt: "2026-09-10T23:30:00.000Z" }),
];

async function mount(project: string, searchParams: Record<string, string> = {}) {
  const { default: QuestionSetsPage } = await loadSrc("app/p/[project]/question-sets/page.tsx");
  const tree = await QuestionSetsPage({
    params: Promise.resolve({ project }),
    searchParams: Promise.resolve(searchParams),
  } as never);
  return render(tree);
}

const rowOf = (name: string) => screen.getByText(name).closest("tr") as HTMLTableRowElement;
/** A row's controls in document order: links and buttons, by their text. */
const controls = (el: HTMLElement) => [...el.querySelectorAll("a, button")].map((c) => c.textContent);
const headers = (c: HTMLElement) => [...c.querySelectorAll("thead th")].map((th) => th.textContent);

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});
beforeEach(() => {
  vi.clearAllMocks();
  questionSetService.list.mockImplementation(async ({ retired }: { retired: boolean }) => (retired ? RETIRED : CURRENT));
});

describe("the question sets page (T20)", () => {
  it("T20 is a --form qf-forms-page main with h1 Question sets and the intro sentence", async () => {
    const { container } = await mount("a");
    expect(container.querySelector("main")!.className).toBe("qualify-page qualify-page--form qf-forms-page");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Question sets");
    expect(container.querySelector("header p")?.textContent ?? "").toContain(
      "Questions are written here. Questionnaires pick them.",
    );
    expect(questionSetService.list).toHaveBeenCalledWith({ retired: false });
  });

  it('T20 "+ New question set" is the primary header link, "Import question set" the ghost one', async () => {
    await mount("a");
    const nw = screen.getByRole("link", { name: "+ New question set" });
    const imp = screen.getByRole("link", { name: "Import question set" });
    expect(nw.getAttribute("href")).toBe("/p/a/question-sets/new");
    expect(imp.getAttribute("href")).toBe("/p/a/question-sets/import");
    expect(nw.classList.contains("btn")).toBe(true);
    expect(nw.classList.contains("ghost")).toBe(false);
    expect(imp.classList.contains("btn")).toBe(true);
    expect(imp.classList.contains("ghost")).toBe(true);
  });

  it("T20 the table.qf-forms-table has the columns Question set, Version, Questions, Made by, Saved by and a hidden Actions", async () => {
    const { container } = await mount("a");
    const table = container.querySelector("table")!;
    expect(table.classList.contains("qf-forms-table")).toBe(true);
    expect(headers(container)).toEqual(["Question set", "Version", "Questions", "Made by", "Saved by", "Actions"]);
    const last = [...container.querySelectorAll("thead th")].at(-1)!;
    expect(last.querySelector(".qf-sr")?.textContent).toBe("Actions");
    for (const r of container.querySelectorAll("tbody tr")) {
      expect([...r.children].filter((c) => c.tagName === "TD")).toHaveLength(6);
    }
  });

  it("T20 rows are in the order Annex IV, then by name ignoring case; Annex IV carries the built in tag", async () => {
    const { container } = await mount("a");
    const names = [...container.querySelectorAll("tbody tr")].map((r) => r.querySelector("td strong")?.textContent);
    expect(names).toEqual(["Annex IV", "Acme AI policy", "Zeta"]);
    const tag = rowOf("Annex IV").querySelector("td span.qf-tag");
    expect(tag?.textContent).toBe("built in");
    expect(rowOf("Acme AI policy").querySelector("span.qf-tag")).toBeNull();
  });

  it("T20 a row shows v<N>, the question count, who made it, and Saved by <created_by>, <UTC date>", async () => {
    await mount("a");
    const cells = (name: string) => [...rowOf(name).children].map((c) => c.textContent);
    expect(cells("Annex IV")[1]).toBe("v1");
    expect(cells("Annex IV")[2]).toBe("14");
    expect(cells("Annex IV")[3]).toBe("Built in");
    expect(cells("Annex IV")[4]).toBe("system, 2026-09-25");
    expect(cells("Acme AI policy")[3]).toBe("Imported");
    expect(cells("Acme AI policy")[4]).toBe("alice, 2026-09-24");
  });

  it("T20 each row's actions, in order: Open, Edit (not builtin), Export CSV, Export Markdown, Retire (not builtin)", async () => {
    await mount("a");
    const actions = (name: string) => controls(rowOf(name).lastElementChild as HTMLElement);
    expect(actions("Annex IV")).toEqual(["Open", "Export CSV", "Export Markdown"]);
    expect(actions("Acme AI policy")).toEqual(["Open", "Edit", "Export CSV", "Export Markdown", "Retire"]);
    const links = within(rowOf("Acme AI policy")).getAllByRole("link") as HTMLAnchorElement[];
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/p/a/question-sets/acme%20ai",
      "/p/a/question-sets/acme%20ai/edit",
      "/p/a/question-sets/acme%20ai/export?format=csv&version=3",
      "/p/a/question-sets/acme%20ai/export?format=md&version=3",
    ]);
    expect(links[2].hasAttribute("download")).toBe(true);
    expect(links[3].hasAttribute("download")).toBe(true);
  });

  it("T20 the export links carry the base path, as 06 R58 did", async () => {
    vi.stubEnv("NEXT_BASE_PATH", "/qualification");
    await mount("a");
    const links = within(rowOf("Annex IV")).getAllByRole("link") as HTMLAnchorElement[];
    const exports = links.filter((l) => /^Export/.test(l.textContent ?? ""));
    expect(exports.map((l) => l.getAttribute("href"))).toEqual([
      "/qualification/p/a/question-sets/annex-iv/export?format=csv&version=1",
      "/qualification/p/a/question-sets/annex-iv/export?format=md&version=1",
    ]);
  });

  it("T20 T56 Retire is a RetireButton that retires that set through retireQuestionSet(project, setId)", async () => {
    retireQuestionSet.mockResolvedValue(undefined);
    await mount("a");
    fireEvent.click(within(rowOf("Zeta")).getByRole("button", { name: "Retire" }));
    expect(rowOf("Zeta").textContent).toContain("Retire Zeta? Cards and questionnaires that use it keep it.");
    fireEvent.click(within(rowOf("Zeta")).getByRole("button", { name: "Retire" }));
    await waitFor(() => expect(retireQuestionSet).toHaveBeenCalledWith("a", "zeta"));
  });

  it("T20 a link Show retired question sets leads to ?retired=1", async () => {
    await mount("a");
    const link = screen.getByRole("link", { name: "Show retired question sets" });
    expect(link.getAttribute("href")).toBe("/p/a/question-sets?retired=1");
    expect(screen.queryByRole("link", { name: "Show current question sets" })).toBeNull();
  });

  it("T20 ?retired=1 lists only retired sets, with a Retired date instead of Saved by, and only Open and the exports", async () => {
    const { container } = await mount("a", { retired: "1" });
    expect(questionSetService.list).toHaveBeenCalledWith({ retired: true });
    expect(headers(container)).toEqual(["Question set", "Version", "Questions", "Made by", "Retired", "Actions"]);
    const names = [...container.querySelectorAll("tbody tr")].map((r) => r.querySelector("td strong")?.textContent);
    expect(names).toEqual(["Old policy"]);
    const cells = [...rowOf("Old policy").children].map((c) => c.textContent);
    expect(cells[4]).toBe("2026-09-10");
    expect(controls(rowOf("Old policy").lastElementChild as HTMLElement)).toEqual(["Open", "Export CSV", "Export Markdown"]);
    const back = screen.getByRole("link", { name: "Show current question sets" });
    expect(back.getAttribute("href")).toBe("/p/a/question-sets");
    expect(screen.queryByRole("link", { name: "Show retired question sets" })).toBeNull();
  });
});

describe("question sets are install-wide (T63)", () => {
  it("T63 projects a and b see the same rows; only the /p/<project>/ prefix of the links differs", async () => {
    const a = await mount("a");
    const rowsA = [...a.container.querySelectorAll("tbody tr")].map((r) => r.textContent);
    const hrefsA = [...a.container.querySelectorAll("a")].map((l) => l.getAttribute("href"));
    cleanup();
    const b = await mount("b");
    const rowsB = [...b.container.querySelectorAll("tbody tr")].map((r) => r.textContent);
    const hrefsB = [...b.container.querySelectorAll("a")].map((l) => l.getAttribute("href"));
    expect(rowsB).toEqual(rowsA);
    expect(hrefsA.length).toBeGreaterThan(0);
    expect(hrefsA.every((h) => h!.startsWith("/p/a/"))).toBe(true);
    expect(hrefsB.map((h) => h!.replace(/^\/p\/b\//, "/p/a/"))).toEqual(hrefsA);
    // the service is never told the project
    for (const call of questionSetService.list.mock.calls) expect(call).toEqual([{ retired: false }]);
  });
});
