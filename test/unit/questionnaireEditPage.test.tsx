// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import {
  loadSrc,
  questionnaireVersion,
  seededQuestion,
  setQuestion,
} from "../support/forms";

// The questionnaire builder pages as server components: /questionnaires/<Q>/edit shows who saved
// the latest version and when, opens the builder on Q's latest version and is a wide page;
// /questionnaires/new opens empty or, with ?from=<Q>, from Q's latest version.
// The pages are awaited with the services stood in for; questionnaires/libraryData.ts is real
// (builderData() is questionSetService.groups()).
//
// What these tests rely on:
//   the new page reads ?from through questionnaireService.latestVersion(from) and ignores a
//   version that is null, unlisted or retired; the edit page reads questionnaireService.history(id).

const EDIT = "app/p/[project]/questionnaires/[questionnaireId]/edit/page.tsx";
const NEW = "app/p/[project]/questionnaires/new/page.tsx";

const { questionnaireService, questionSetService, notFound } = vi.hoisted(
  () => ({
    questionnaireService: {
      latestVersion: vi.fn(),
      history: vi.fn(),
      resolve: vi.fn(),
      library: vi.fn(async () => []),
    },
    questionSetService: { groups: vi.fn() },
    notFound: vi.fn(() => {
      throw Object.assign(new Error("NEXT_NOT_FOUND"), { notFound: true });
    }),
  }),
);

// The project doors let these calls through: which project's database a forms page, action or
// route opens, and who may, is pinned by isolationForms.test.ts.
vi.mock("@/lib/projectDb", () => ({
  projectDbPastDoor: async () => ({}),
  projectDbForAction: async () => ({ db: {} }),
  projectDbForRoute: async () => ({}),
}));
vi.mock("next/navigation", () => ({
  notFound,
  redirect: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/services/QuestionnaireService", () => ({
  QuestionnaireService: class {},
  questionnaireService,
  questionnairesOn: () => questionnaireService,
  questionnairesFor: async () => questionnaireService,
}));
vi.mock("@/server/services/QuestionSetService", () => ({
  QuestionSetService: class {},
  questionSetService,
  questionSetsOn: () => questionSetService,
}));
vi.mock("@/app/p/[project]/questionnaires/actions", () => ({
  saveQuestionnaire: vi.fn(),
  useQuestionnaireOnce: vi.fn(),
  retireQuestionnaire: vi.fn(),
}));

const acme3v1 = setQuestion("acme", "q3", {
  text: "Which datasets are approved?",
  setVersionId: "acme-v1",
  setVersionNumber: 1,
});
const acme3v2 = setQuestion("acme", "q3", {
  text: "Which datasets are approved?",
  setVersionId: "acme-v2",
  setVersionNumber: 2,
});
const acme1v2 = setQuestion("acme", "q1", {
  text: "Who signs off a model release?",
  setVersionId: "acme-v2",
  setVersionNumber: 2,
});
const annex1a = seededQuestion("1a");
const GROUPS = [
  {
    setId: "annex-iv",
    setName: "Annex IV",
    versionId: "annex-iv-v1",
    versionNumber: 1,
    retired: false,
    questions: [annex1a],
  },
  {
    setId: "acme",
    setName: "Acme AI policy",
    versionId: "acme-v2",
    versionNumber: 2,
    retired: false,
    questions: [acme1v2, acme3v2],
  },
  {
    setId: "zeta",
    setName: "Zeta",
    versionId: "zeta-v1",
    versionNumber: 1,
    retired: false,
    questions: [setQuestion("zeta", "q1", { setName: "Zeta" })],
  },
];
const Q = questionnaireVersion({
  questionnaireId: "qq",
  questionnaireName: "Release review",
  versionId: "qq-v3",
  versionNumber: 3,
  blocks: ["risks"] as never,
  questions: [acme3v1, annex1a],
});
const HISTORY = [
  {
    versionId: "qq-v3",
    number: 3,
    createdAt: "2026-09-24T23:30:00.000Z",
    createdBy: "bob",
  },
  {
    versionId: "qq-v2",
    number: 2,
    createdAt: "2026-09-20T10:00:00.000Z",
    createdBy: "alice",
  },
  {
    versionId: "qq-v1",
    number: 1,
    createdAt: "2026-09-19T10:00:00.000Z",
    createdBy: "alice",
  },
];

async function openEdit(questionnaireId = "qq") {
  const { default: EditQuestionnairePage } = await loadSrc(EDIT);
  return render(
    await EditQuestionnairePage({
      params: Promise.resolve({ project: "mcas", questionnaireId }),
    } as never),
  );
}
async function openNew(search: Record<string, string> = {}) {
  const { default: NewQuestionnairePage } = await loadSrc(NEW);
  return render(
    await NewQuestionnairePage({
      params: Promise.resolve({ project: "mcas" }),
      searchParams: Promise.resolve(search),
    } as never),
  );
}

const right = () => screen.getByRole("region", { name: "Your questionnaire" });
const setBox = (name: string) =>
  within(screen.getByRole("group", { name: "Select question sets" })).getByRole(
    "checkbox",
    {
      name: new RegExp("^" + name),
    },
  ) as HTMLInputElement;
const rowTexts = () =>
  [...right().querySelectorAll("button[aria-label^='Move ']")]
    .filter((b) => b.getAttribute("aria-label")!.endsWith(" up"))
    .map((b) =>
      b
        .getAttribute("aria-label")!
        .replace(/^Move /, "")
        .replace(/ up$/, ""),
    );

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  questionnaireService.latestVersion.mockImplementation(async (id: string) =>
    id === "qq" ? Q : null,
  );
  questionnaireService.history.mockResolvedValue(HISTORY);
  questionSetService.groups.mockResolvedValue(GROUPS);
});

describe("/questionnaires/<Q>/edit", () => {
  it("T57 under the heading: v<N> saved by <createdBy> on <YYYY-MM-DD> for the latest version (UTC date)", async () => {
    const { container } = await openEdit();
    expect(questionnaireService.history).toHaveBeenCalledWith("qq");
    expect(container.querySelector("p.qf-saved-by")?.textContent).toBe(
      "v3 saved by bob on 2026-09-24",
    );
  });

  it("T32 is a wide page", async () => {
    const { container } = await openEdit();
    expect(container.querySelector("main")?.className).toBe(
      "qualify-page qualify-page--wide qf-forms-page",
    );
  });

  it("T31 opens on Q's latest version: its rows pinned as they were, its sets selected, its blocks, the name read-only", async () => {
    await openEdit();
    expect(questionnaireService.latestVersion).toHaveBeenCalledWith("qq");
    expect(rowTexts()).toEqual([
      "Which datasets are approved?",
      annex1a.text.slice(0, 40).trimEnd(),
    ]);
    expect(right().querySelector("span.qf-builder-owner")?.textContent).toBe(
      "Acme AI policy v1",
    );
    expect(setBox("Acme AI policy").checked).toBe(true);
    expect(setBox("Annex IV").checked).toBe(true);
    expect(setBox("Zeta").checked).toBe(false);
    expect(
      (
        within(right()).getByRole("checkbox", {
          name: "Risks",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(screen.queryByLabelText("Questionnaire name")).toBeNull();
    expect(screen.getAllByText("Release review").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Save as v4" })).toBeTruthy();
  });

  it("T31 T45 the builder gets every set group from questionSetService.groups()", async () => {
    await openEdit();
    expect(questionSetService.groups).toHaveBeenCalledWith();
    expect(setBox("Zeta")).toBeTruthy();
  });
});

describe("/questionnaires/new", () => {
  it("T31 T32 opens empty and wide: nothing selected, all 9 blocks, a name input", async () => {
    const { container } = await openNew();
    expect(container.querySelector("main")?.className).toBe(
      "qualify-page qualify-page--wide qf-forms-page",
    );
    for (const name of ["Annex IV", "Acme AI policy", "Zeta"])
      expect(setBox(name).checked).toBe(false);
    expect(rowTexts()).toEqual([]);
    expect(
      (
        within(right()).getByRole("checkbox", {
          name: "Risks",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(screen.getByLabelText("Questionnaire name")).toBeTruthy();
  });

  it("T31 ?from=<Q> opens with Q's latest items pinned to the same set versions, its sets selected", async () => {
    await openNew({ from: "qq" });
    expect(questionnaireService.latestVersion).toHaveBeenCalledWith("qq");
    expect(rowTexts()).toEqual([
      "Which datasets are approved?",
      annex1a.text.slice(0, 40).trimEnd(),
    ]);
    expect(right().querySelector("span.qf-builder-owner")?.textContent).toBe(
      "Acme AI policy v1",
    );
    expect(setBox("Acme AI policy").checked).toBe(true);
    expect(screen.getByLabelText("Questionnaire name")).toBeTruthy();
  });

  it("T31 T35 an unknown or retired ?from opens the empty builder", async () => {
    await openNew({ from: "nope" });
    expect(rowTexts()).toEqual([]);
    cleanup();
    questionnaireService.latestVersion.mockResolvedValue({
      ...Q,
      retired: true,
    });
    await openNew({ from: "qq" });
    expect(rowTexts()).toEqual([]);
    for (const name of ["Annex IV", "Acme AI policy", "Zeta"])
      expect(setBox(name).checked).toBe(false);
  });
});
