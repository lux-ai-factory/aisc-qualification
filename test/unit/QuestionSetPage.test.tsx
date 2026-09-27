// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { customQuestion, loadSrc, seededQuestion, setVersion, annexSetLiteral } from "../support/forms";

// One question set's page /p/[project]/question-sets/[setId] (two-level forms,
// docs/superpowers/two-level-forms-2026-09-25/01-spec.md, T21): who saved each version and when,
// one version's questions, Edit and the exports. Rendered as the server component it is with
// questionSetService mocked. Loaded at run time so a missing page fails each test.
//
// Choices made here where the spec is silent: the page reads the versions through
// questionSetService.history(setId) (VersionStamp[], newest first) and the shown version through
// questionSetService.atNumber(setId, n) (n undefined = latest; latest(setId) is mocked to the same);
// a version link's href ends in `?version=<n>` (relative, or the page's own path).

const { questionSetService, notFound, retireQuestionSet } = vi.hoisted(() => ({
  questionSetService: {
    history: vi.fn(),
    atNumber: vi.fn(),
    latest: vi.fn(),
    resolveSetVersion: vi.fn(),
    list: vi.fn(),
    groups: vi.fn(),
  },
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  retireQuestionSet: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/server/services/QuestionSetService", () => ({ QuestionSetService: class {}, questionSetService }));
vi.mock("@/app/p/[project]/question-sets/actions", () => ({ saveQuestionSet: vi.fn(), retireQuestionSet }));

const v1 = setVersion({
  setId: "acme",
  setName: "Acme AI policy",
  description: "Our internal AI policy, as questions.",
  versionId: "acme-v1",
  versionNumber: 1,
  questions: [customQuestion("acme", "q1", { text: "Who signs off?", citation: "§4.2" })],
});
const v2 = setVersion({
  setId: "acme",
  setName: "Acme AI policy",
  description: "Our internal AI policy, as questions.",
  versionId: "acme-v2",
  versionNumber: 2,
  questions: [
    customQuestion("acme", "q1", { text: "Who signs off a release?", citation: "§4.2", setVersionId: "acme-v2", setVersionNumber: 2 }),
    customQuestion("acme", "q2", { text: "Which data?", required: false, annexPoint: "2d" as never, setVersionId: "acme-v2", setVersionNumber: 2 }),
  ],
});
const HISTORY = [
  { versionId: "acme-v2", number: 2, createdAt: "2026-09-24T23:30:00.000Z", createdBy: "bob" },
  { versionId: "acme-v1", number: 1, createdAt: "2026-09-20T10:00:00.000Z", createdBy: "alice" },
];

function serve(versions: Record<number, unknown>, latest: number, history = HISTORY) {
  questionSetService.history.mockResolvedValue(history);
  questionSetService.atNumber.mockImplementation(async (_id: string, n?: number) => (versions[n ?? latest] ?? null) as never);
  questionSetService.latest.mockResolvedValue(versions[latest]);
  questionSetService.resolveSetVersion.mockImplementation(
    async (id: string) => Object.values(versions).find((v) => (v as { versionId: string }).versionId === id) ?? null,
  );
}

async function page(searchParams: Record<string, string> = {}, setId = "acme", project = "a") {
  const { default: QuestionSetPage } = await loadSrc("app/p/[project]/question-sets/[setId]/page.tsx");
  return QuestionSetPage({
    params: Promise.resolve({ project, setId }),
    searchParams: Promise.resolve(searchParams),
  } as never);
}
const mount = async (searchParams: Record<string, string> = {}, setId = "acme") => render(await page(searchParams, setId));

const versionItems = (c: HTMLElement) => [...c.querySelectorAll("ol.qf-set-versions > li")] as HTMLElement[];
const questionRows = (c: HTMLElement) => [...c.querySelectorAll("ol.qf-builder-rows > li")] as HTMLElement[];
const exportLinks = () =>
  (screen.getAllByRole("link") as HTMLAnchorElement[]).filter((l) => /\/export\?/.test(l.getAttribute("href") ?? ""));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  serve({ 1: v1, 2: v2 }, 2);
});

describe("one question set's page (T21)", () => {
  it("T21 shows the set's name as h1 and its description", async () => {
    const { container } = await mount();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Acme AI policy");
    expect(container.textContent).toContain("Our internal AI policy, as questions.");
    expect(container.querySelector("main")!.className).toBe("qualify-page qualify-page--form qf-forms-page");
  });

  it("T21 ol.qf-set-versions lists one li per version, newest first: v<n> · <created_by> · <YYYY-MM-DD in UTC>", async () => {
    const { container } = await mount();
    expect(questionSetService.history).toHaveBeenCalledWith("acme");
    expect(versionItems(container).map((li) => li.textContent)).toEqual([
      "v2 · bob · 2026-09-24",
      "v1 · alice · 2026-09-20",
    ]);
  });

  it("T21 each version links ?version=<n>", async () => {
    const { container } = await mount();
    const hrefs = versionItems(container).map((li) => li.querySelector("a")?.getAttribute("href") ?? "");
    expect(hrefs[0]).toMatch(/(^|\/p\/a\/question-sets\/acme)\?version=2$/);
    expect(hrefs[1]).toMatch(/(^|\/p\/a\/question-sets\/acme)\?version=1$/);
  });

  it("T21 by default the latest version's questions show as the set editor's rows, without buttons", async () => {
    const { container } = await mount();
    const rows = questionRows(container);
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Who signs off a release?");
    expect(rows[0].textContent).toContain("§4.2");
    expect(rows[1].textContent).toContain("Which data?");
    expect(rows[1].textContent).toContain("Annex IV(2)(d)");
    expect(rows[1].textContent).toContain("Optional");
    expect(container.querySelector("ol.qf-builder-rows")!.querySelectorAll("button")).toHaveLength(0);
  });

  it("T21 ?version=1 shows v1's questions and exports v1", async () => {
    const { container } = await mount({ version: "1" });
    const rows = questionRows(container);
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Who signs off?");
    expect(exportLinks().map((l) => l.getAttribute("href"))).toEqual([
      "/p/a/question-sets/acme/export?format=csv&version=1",
      "/p/a/question-sets/acme/export?format=md&version=1",
    ]);
  });

  it("T21 the two export links are for the shown version (latest by default), as downloads", async () => {
    await mount();
    const links = exportLinks();
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/p/a/question-sets/acme/export?format=csv&version=2",
      "/p/a/question-sets/acme/export?format=md&version=2",
    ]);
    for (const l of links) expect(l.hasAttribute("download")).toBe(true);
  });

  it("T21 Edit leads to the set editor for a builder set", async () => {
    await mount();
    expect(screen.getByRole("link", { name: "Edit" }).getAttribute("href")).toBe("/p/a/question-sets/acme/edit");
  });

  it("T21 Edit is hidden for the builtin set and for a retired set; the exports stay", async () => {
    serve({ 1: annexSetLiteral() }, 1, [
      { versionId: "annex-iv-v1", number: 1, createdAt: "2026-09-25T08:00:00.000Z", createdBy: "system" },
    ]);
    const builtin = await mount({}, "annex-iv");
    expect(within(builtin.container).queryByRole("link", { name: "Edit" })).toBeNull();
    expect(exportLinks()).toHaveLength(2);
    expect(versionItems(builtin.container).map((li) => li.textContent)).toEqual(["v1 · system · 2026-09-25"]);
    cleanup();
    const retired = setVersion({ ...v2, retired: true, questions: [seededQuestion("2a")] });
    serve({ 2: retired }, 2);
    const r = await mount();
    expect(within(r.container).queryByRole("link", { name: "Edit" })).toBeNull();
    expect(exportLinks()).toHaveLength(2);
  });

  it("T21 ?version=<unknown> answers 404 (notFound)", async () => {
    await expect(page({ version: "9" })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(page({ version: "x" })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("T21 an unknown set answers 404", async () => {
    serve({}, 1, []);
    await expect(page({}, "nope")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("T21 ?unchanged=1 shows p.qf-prefilled No changes: still v<N>.", async () => {
    const { container } = await mount({ version: "2", unchanged: "1" });
    expect(container.querySelector("p.qf-prefilled")?.textContent).toBe("No changes: still v2.");
  });

  it("T21 without ?unchanged there is no such notice", async () => {
    const { container } = await mount();
    expect(container.querySelector("p.qf-prefilled")).toBeNull();
  });
});
