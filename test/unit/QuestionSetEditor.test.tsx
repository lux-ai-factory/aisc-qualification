// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { KEY_QUESTIONS } from "@/data/keyQuestions";
import { customQuestion, loadSrc, setVersion } from "../support/forms";

// The question-set editor, run through the two pages that mount it: /question-sets/new and
// /question-sets/<S>/edit (and its 404). The pages are server components, awaited with
// questionSetService mocked, then
// rendered; the editor is QuestionSetEditor.tsx. Pages and editor are loaded at run time so a
// missing module fails each test, not the file.
//
// What these tests rely on: the edit page reads the set's latest version
// through questionSetService.latest(setId) (atNumber and resolveSetVersion are mocked to the same
// answer); the editor's question editor is the panel .qf-builder-editor holding a textarea, the
// citation input, the "Required" checkbox and the "Answers Annex IV point" select; each row's Edit
// and Remove buttons are named "Edit ..." / "Remove ..." after the row.

const { questionSetService, saveQuestionSet, retireQuestionSet, notFound } =
  vi.hoisted(() => ({
    questionSetService: {
      latest: vi.fn(),
      atNumber: vi.fn(),
      resolveSetVersion: vi.fn(),
      list: vi.fn(),
      groups: vi.fn(),
      history: vi.fn(),
    },
    saveQuestionSet: vi.fn(),
    retireQuestionSet: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
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
  notFound,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/server/services/QuestionSetService", () => ({
  QuestionSetService: class {},
  questionSetService,
  questionSetsOn: () => questionSetService,
}));
vi.mock("@/app/p/[project]/question-sets/actions", () => ({
  saveQuestionSet,
  retireQuestionSet,
}));

const q1 = customQuestion("acme", "q1", {
  text: "Who signs off a model release?",
  citation: "Acme AI Policy §4.2",
  setVersionId: "acme-v3",
  setVersionNumber: 3,
});
const q2 = customQuestion("acme", "q2", {
  text: "Which datasets are approved?",
  citation: "",
  required: false,
  annexPoint: "2d" as never,
  setVersionId: "acme-v3",
  setVersionNumber: 3,
});
const acmeV3 = setVersion({
  setId: "acme",
  setName: "Acme AI policy",
  description: "Our internal AI policy, as questions.",
  versionId: "acme-v3",
  versionNumber: 3,
  questions: [q1, q2],
});

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  questionSetService.latest.mockResolvedValue(acmeV3);
  questionSetService.atNumber.mockResolvedValue(acmeV3);
  questionSetService.resolveSetVersion.mockResolvedValue(acmeV3);
});

async function mountNew(project = "mcas") {
  const { default: NewQuestionSetPage } = await loadSrc(
    "app/p/[project]/question-sets/new/page.tsx",
  );
  const tree = await NewQuestionSetPage({
    params: Promise.resolve({ project }),
    searchParams: Promise.resolve({}),
  } as never);
  return render(tree);
}

async function editPage(setId = "acme", project = "mcas") {
  const { default: EditQuestionSetPage } = await loadSrc(
    "app/p/[project]/question-sets/[setId]/edit/page.tsx",
  );
  return EditQuestionSetPage({
    params: Promise.resolve({ project, setId }),
    searchParams: Promise.resolve({}),
  } as never);
}
const mountEdit = async (setId = "acme") => render(await editPage(setId));

const rowsList = (c: HTMLElement) =>
  c.querySelector("ol.qf-builder-rows") as HTMLOListElement;
const rows = (c: HTMLElement) =>
  [...(rowsList(c)?.querySelectorAll(":scope > li") ?? [])] as HTMLElement[];
const editor = (c: HTMLElement) =>
  c.querySelector(".qf-builder-editor") as HTMLElement | null;

/** "+ New question", fill the editor, "Save question". */
function addQuestion(
  c: HTMLElement,
  v: { text: string; citation?: string; required?: boolean; point?: string },
) {
  fireEvent.click(screen.getByRole("button", { name: "+ New question" }));
  const panel = editor(c)!;
  fireEvent.change(panel.querySelector("textarea")!, {
    target: { value: v.text },
  });
  if (v.citation !== undefined) {
    fireEvent.change(
      within(panel).getByPlaceholderText("e.g. Acme AI Policy §4.2"),
      { target: { value: v.citation } },
    );
  }
  if (v.required === false)
    fireEvent.click(within(panel).getByRole("checkbox", { name: "Required" }));
  if (v.point) {
    const select = within(panel).getByLabelText(
      "Answers Annex IV point",
    ) as HTMLSelectElement;
    fireEvent.change(select, {
      target: {
        value: [...select.options].find((o) => o.textContent === v.point)!
          .value,
      },
    });
  }
  fireEvent.click(within(panel).getByRole("button", { name: "Save question" }));
}

describe("a new question set (T17)", () => {
  it("T17 the page is a --form qf-forms-page main with the crumb back to the question sets and the heading", async () => {
    const { container } = await mountNew("mcas");
    const main = container.querySelector("main")!;
    expect(main.className).toBe(
      "qualify-page qualify-page--form qf-forms-page",
    );
    const crumb = screen.getByRole("link", { name: "← Question sets" });
    expect(crumb.getAttribute("href")).toBe("/p/mcas/question-sets");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "New question set",
    );
  });

  it("T17 it has a Name input (maxLength 120), a Description textarea (maxLength 500), the rows list and + New question", async () => {
    const { container } = await mountNew();
    const name = screen.getByLabelText("Name") as HTMLInputElement;
    expect(name.tagName).toBe("INPUT");
    expect(name.maxLength).toBe(120);
    const description = screen.getByLabelText(
      "Description",
    ) as HTMLTextAreaElement;
    expect(description.tagName).toBe("TEXTAREA");
    expect(description.maxLength).toBe(500);
    expect(rowsList(container)).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ New question" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Save question set" }),
    ).toBeTruthy();
  });

  it('T17 R19 "+ New question" opens the editor with its fields and defaults', async () => {
    const { container } = await mountNew();
    expect(editor(container)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "+ New question" }));
    const panel = editor(container)!;
    expect(panel).toBeTruthy();
    const text = panel.querySelector("textarea") as HTMLTextAreaElement;
    expect(text).toBeTruthy();
    expect(text.required).toBe(true);
    expect(text.maxLength).toBe(2000);
    const citation = within(panel).getByPlaceholderText(
      "e.g. Acme AI Policy §4.2",
    ) as HTMLInputElement;
    expect(citation.maxLength).toBe(200);
    expect(
      (
        within(panel).getByRole("checkbox", {
          name: "Required",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    const point = within(panel).getByLabelText(
      "Answers Annex IV point",
    ) as HTMLSelectElement;
    expect([...point.options].map((o) => o.textContent)).toEqual([
      "None",
      ...KEY_QUESTIONS.map((q) => q.citation),
    ]);
    expect(point.selectedOptions[0].textContent).toBe("None");
  });

  it("T17 R19 Save question appends the row: position, text, citation chip, Annex point chip, Required tag", async () => {
    const { container } = await mountNew();
    addQuestion(container, {
      text: "Who may retrain the model?",
      citation: "§6.3",
      point: "Annex IV(2)(f)",
    });
    expect(editor(container)).toBeNull();
    const [row] = rows(container);
    expect(rows(container)).toHaveLength(1);
    expect(row.textContent).toContain("1");
    expect(row.textContent).toContain("Who may retrain the model?");
    expect(
      [...row.querySelectorAll("span.qf-citation")].map((s) => s.textContent),
    ).toContain("§6.3");
    expect(row.textContent).toContain("Annex IV(2)(f)");
    expect(row.textContent).toContain("Required");
    addQuestion(container, {
      text: "Is there a rollback plan?",
      required: false,
    });
    expect(rows(container)[1].textContent).toContain("Optional");
  });

  it("T17 R19 Edit reopens the editor on the row, and saving changes it in place", async () => {
    const { container } = await mountNew();
    addQuestion(container, {
      text: "Who may retrain the model?",
      citation: "§6.3",
    });
    addQuestion(container, { text: "Is there a rollback plan?" });
    fireEvent.click(
      within(rows(container)[0]).getByRole("button", { name: /^Edit/ }),
    );
    const panel = editor(container)!;
    const text = panel.querySelector("textarea") as HTMLTextAreaElement;
    expect(text.value).toBe("Who may retrain the model?");
    expect(
      (
        within(panel).getByPlaceholderText(
          "e.g. Acme AI Policy §4.2",
        ) as HTMLInputElement
      ).value,
    ).toBe("§6.3");
    fireEvent.change(text, {
      target: { value: "Who may retrain the model, and when?" },
    });
    fireEvent.click(
      within(panel).getByRole("button", { name: "Save question" }),
    );
    expect(rows(container)).toHaveLength(2);
    expect(rows(container)[0].textContent).toContain(
      "Who may retrain the model, and when?",
    );
    expect(rows(container)[1].textContent).toContain(
      "Is there a rollback plan?",
    );
  });

  it("T17 R19 Cancel closes the editor and adds nothing", async () => {
    const { container } = await mountNew();
    fireEvent.click(screen.getByRole("button", { name: "+ New question" }));
    fireEvent.change(editor(container)!.querySelector("textarea")!, {
      target: { value: "Not kept" },
    });
    fireEvent.click(
      within(editor(container)!).getByRole("button", { name: "Cancel" }),
    );
    expect(editor(container)).toBeNull();
    expect(rows(container)).toHaveLength(0);
    expect(container.textContent).not.toContain("Not kept");
  });

  it("T17 R18 each row has Move up / Move down named after the first 40 characters; the ends are disabled; a move moves by one", async () => {
    const { container } = await mountNew();
    addQuestion(container, {
      text: "Which datasets are approved for training and by whom are they signed?",
    });
    addQuestion(container, { text: "Who signs off a model release?" });
    const up = screen.getByRole("button", {
      name: "Move Which datasets are approved for training up",
    }) as HTMLButtonElement;
    const lastDown = screen.getByRole("button", {
      name: "Move Who signs off a model release? down",
    }) as HTMLButtonElement;
    expect(up.disabled).toBe(true);
    expect(lastDown.disabled).toBe(true);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Move Who signs off a model release? up",
      }),
    );
    expect(rows(container)[0].textContent).toContain(
      "Who signs off a model release?",
    );
  });

  it("T17 R19 Remove removes a row", async () => {
    const { container } = await mountNew();
    addQuestion(container, { text: "Who may retrain the model?" });
    addQuestion(container, { text: "Is there a rollback plan?" });
    fireEvent.click(
      within(rows(container)[0]).getByRole("button", { name: /^Remove/ }),
    );
    expect(rows(container)).toHaveLength(1);
    expect(container.textContent).not.toContain("Who may retrain the model?");
  });

  it("T17 there is no Use once button and no block checkbox in the set editor", async () => {
    const { container } = await mountNew();
    expect(screen.queryByRole("button", { name: "Use once" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Risks" })).toBeNull();
    expect(container.querySelector(".qf-builder-blocks")).toBeNull();
    expect(container.textContent).not.toContain("Always included");
  });

  it("T17 Save question set calls saveQuestionSet(project, JSON.stringify(toSetDraft(state)), undefined, {origin, alsoQuestionnaire})", async () => {
    saveQuestionSet.mockResolvedValue(undefined);
    const { container } = await mountNew("mcas");
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Acme AI policy" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Our policy." },
    });
    addQuestion(container, {
      text: "Who signs off a model release?",
      citation: "§4.2",
      point: "Annex IV(2)(a)",
    });
    addQuestion(container, {
      text: "Is there a rollback plan?",
      required: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "Save question set" }));
    await waitFor(() => expect(saveQuestionSet).toHaveBeenCalledTimes(1));
    const [project, json, setId, opts] = saveQuestionSet.mock.calls[0];
    expect(project).toBe("mcas");
    expect(setId ?? undefined).toBeUndefined();
    expect(opts).toEqual({ origin: "builder", alsoQuestionnaire: false });
    expect(typeof json).toBe("string");
    expect(JSON.parse(json)).toEqual({
      name: "Acme AI policy",
      description: "Our policy.",
      questions: [
        {
          text: "Who signs off a model release?",
          citation: "§4.2",
          required: true,
          annexPoint: "2a",
        },
        {
          text: "Is there a rollback plan?",
          citation: "",
          required: false,
          annexPoint: null,
        },
      ],
    });
  });

  it("T17 an {error} from the save shows in div.error above the footer", async () => {
    saveQuestionSet.mockResolvedValue({
      error: "Give the question set a name.",
    });
    const { container } = await mountNew();
    fireEvent.click(screen.getByRole("button", { name: "Save question set" }));
    await waitFor(() =>
      expect(container.querySelector("div.error")?.textContent).toBe(
        "Give the question set a name.",
      ),
    );
    const error = container.querySelector("div.error")!;
    const footer = screen.getByRole("button", {
      name: "Save question set",
    }).parentElement!;
    // above the footer: the error comes before the footer in document order
    expect(
      error.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("editing a question set (T17, T15)", () => {
  it("T17 the heading is Edit <name>; the name and description show as text, not inputs", async () => {
    const { container } = await mountEdit();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Edit Acme AI policy",
    );
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.queryByLabelText("Description")).toBeNull();
    expect(container.textContent).toContain(
      "Our internal AI policy, as questions.",
    );
    expect(container.querySelector("main")!.className).toBe(
      "qualify-page qualify-page--form qf-forms-page",
    );
  });

  it("T17 the intro names the latest version and the next one, and the footer reads Save as v<N+1>", async () => {
    const { container } = await mountEdit();
    expect(container.textContent).toContain(
      "v3 is the latest version. Saving makes v4; questionnaires pinned to earlier versions keep them.",
    );
    expect(screen.getByRole("button", { name: "Save as v4" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Save question set" }),
    ).toBeNull();
  });

  it("T17 every question of the latest version opens as a row with its wording", async () => {
    const { container } = await mountEdit();
    expect(rows(container)).toHaveLength(2);
    expect(rows(container)[0].textContent).toContain(
      "Who signs off a model release?",
    );
    expect(rows(container)[0].textContent).toContain("Acme AI Policy §4.2");
    expect(rows(container)[1].textContent).toContain(
      "Which datasets are approved?",
    );
    expect(rows(container)[1].textContent).toContain("Annex IV(2)(d)");
    expect(rows(container)[1].textContent).toContain("Optional");
  });

  it("T17 saving sends the set id and the rows with their question ids; a new row has none", async () => {
    saveQuestionSet.mockResolvedValue(undefined);
    const { container } = await mountEdit();
    addQuestion(container, { text: "Is there a rollback plan?" });
    fireEvent.click(screen.getByRole("button", { name: "Save as v4" }));
    await waitFor(() => expect(saveQuestionSet).toHaveBeenCalledTimes(1));
    const [project, json, setId, opts] = saveQuestionSet.mock.calls[0];
    expect(project).toBe("mcas");
    expect(setId).toBe("acme");
    expect(opts).toEqual({ origin: "builder", alsoQuestionnaire: false });
    const draft = JSON.parse(json);
    expect(draft.questions).toEqual([
      {
        questionId: "acme-q1",
        text: "Who signs off a model release?",
        citation: "Acme AI Policy §4.2",
        required: true,
        annexPoint: null,
      },
      {
        questionId: "acme-q2",
        text: "Which datasets are approved?",
        citation: "",
        required: false,
        annexPoint: "2d",
      },
      {
        text: "Is there a rollback plan?",
        citation: "",
        required: true,
        annexPoint: null,
      },
    ]);
    // no row keys and no group labels travel (toSetDraft)
    expect(json).not.toMatch(/rowKey|groupLabel/);
  });

  it("T15 /question-sets/<S>/edit answers 404 (notFound) for a builtin, a retired or an unknown set", async () => {
    questionSetService.latest.mockResolvedValue(
      setVersion({
        setId: "annex-iv",
        setName: "Annex IV",
        origin: "builtin",
        builtin: true,
      }),
    );
    questionSetService.atNumber.mockResolvedValue(
      setVersion({
        setId: "annex-iv",
        setName: "Annex IV",
        origin: "builtin",
        builtin: true,
      }),
    );
    await expect(editPage("annex-iv")).rejects.toThrow("NEXT_NOT_FOUND");
    const retired = setVersion({ setId: "old", setName: "Old", retired: true });
    questionSetService.latest.mockResolvedValue(retired);
    questionSetService.atNumber.mockResolvedValue(retired);
    await expect(editPage("old")).rejects.toThrow("NEXT_NOT_FOUND");
    questionSetService.latest.mockResolvedValue(null);
    questionSetService.atNumber.mockResolvedValue(null);
    await expect(editPage("nope")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(3);
  });
});
