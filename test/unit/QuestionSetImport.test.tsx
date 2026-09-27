// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { loadSrc } from "../support/forms";

// Importing a question set from a file (two-level forms,
// docs/superpowers/two-level-forms-2026-09-25/01-spec.md, T49): the old form import page moved to
// /question-sets/import (spec 8.2: replaces FormImport.test.tsx). Upload, preview and correct
// (01 R28, 06 R59, unchanged), then the SET EDITOR in place (not the builder), with the rows as
// new questions, the file's name as the set's name, origin "import", and the unchecked box
// "Also make a questionnaire with all its questions" (D22).
//
// Carried from FormImport.test.tsx: the R28 accept, send, preview, remove and failed-read cases
// and the three R59 cases, with readFormFile -> readQuestionSetFile and the builder's
// "Form name"/"Save form" -> the set editor's "Name"/"Save question set".
//
// Choices made here where the spec is silent: QuestionSetImport.tsx takes props {project, header?};
// saving calls saveQuestionSet(project, draftJson, undefined, {origin: "import", alsoQuestionnaire}).

const { readQuestionSetFile, saveQuestionSet } = vi.hoisted(() => ({
  readQuestionSetFile: vi.fn(),
  saveQuestionSet: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/app/p/[project]/question-sets/import/actions", () => ({ readQuestionSetFile }));
vi.mock("@/app/p/[project]/question-sets/actions", () => ({ saveQuestionSet, retireQuestionSet: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));

afterEach(cleanup);
beforeEach(() => {
  readQuestionSetFile.mockReset();
  saveQuestionSet.mockReset();
});

const found = {
  ok: true,
  found: 3,
  questions: [
    { text: "Who signs off a model release?", citation: "Acme AI Policy §4.2", required: true },
    { text: "Which datasets are approved?", citation: "", required: false },
    { text: "How are incidents reported?", citation: "§7", required: false },
  ],
  warnings: ["Skipped 1 heading.", "Removed 1 duplicate question."],
};

async function mount() {
  const { default: QuestionSetImport } = await loadSrc("app/p/[project]/question-sets/import/QuestionSetImport.tsx");
  return render(<QuestionSetImport project="mcas" />);
}

async function upload(container: HTMLElement, name = "acme.csv") {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], name)] } });
  await waitFor(() => expect(readQuestionSetFile).toHaveBeenCalled());
}

const also = () =>
  screen.getByRole("checkbox", { name: "Also make a questionnaire with all its questions" }) as HTMLInputElement;

describe("importing a question-set file (T49, 01 R28)", () => {
  it("T49 R28 takes .csv, .md, .markdown and .docx files", async () => {
    const { container } = await mount();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.accept).toBe(".csv,.md,.markdown,.docx");
  });

  it("T49 R28 sends the chosen file to readQuestionSetFile", async () => {
    readQuestionSetFile.mockResolvedValue(found);
    const { container } = await mount();
    await upload(container);
    const sent = readQuestionSetFile.mock.calls[0][0] as FormData;
    expect(sent.get("file")).toBeInstanceOf(File);
    expect((sent.get("file") as File).name).toBe("acme.csv");
  });

  it("T49 R28 previews what was found, with the warnings, one editable row per question", async () => {
    readQuestionSetFile.mockResolvedValue(found);
    const { container } = await mount();
    await upload(container);
    await screen.findByText("Found 3 questions in acme.csv");
    const warnings = [...container.querySelectorAll("li")].map((li) => li.textContent);
    expect(warnings).toContain("Skipped 1 heading.");
    expect(warnings).toContain("Removed 1 duplicate question.");
    expect(screen.getByDisplayValue("Who signs off a model release?")).toBeTruthy();
    expect(screen.getByDisplayValue("Acme AI Policy §4.2")).toBeTruthy();
    const required = screen.getAllByRole("checkbox", { name: "Required" }) as HTMLInputElement[];
    expect(required.map((c) => c.checked)).toEqual([true, false, false]);
    expect(screen.getAllByRole("button", { name: /^Remove/ })).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Continue with 3 questions" })).toBeTruthy();
  });

  it("T49 R28 removing rows updates the count, and at 0 the confirm is disabled", async () => {
    readQuestionSetFile.mockResolvedValue(found);
    const { container } = await mount();
    await upload(container);
    await screen.findByText("Found 3 questions in acme.csv");
    fireEvent.click(screen.getAllByRole("button", { name: /^Remove/ })[1]);
    expect(screen.getByRole("button", { name: "Continue with 2 questions" })).toBeTruthy();
    expect(screen.queryByDisplayValue("Which datasets are approved?")).toBeNull();
    for (const b of screen.getAllByRole("button", { name: /^Remove/ })) fireEvent.click(b);
    const confirm = screen.getByRole("button", { name: /^Continue with 0 questions$/ }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
  });

  it("T49 R28 a failed read shows the error and nothing else changes", async () => {
    readQuestionSetFile.mockResolvedValue({ ok: false, error: "The form reader could not be reached." });
    const { container } = await mount();
    await upload(container);
    await screen.findByText("The form reader could not be reached.");
    expect(screen.queryByRole("button", { name: /^Continue with/ })).toBeNull();
    expect(container.querySelector('input[type="file"]')).toBeTruthy();
  });

  it("T49 confirming mounts the set editor in place: new rows, the file name as the name, no builder", async () => {
    readQuestionSetFile.mockResolvedValue(found);
    const { container } = await mount();
    await upload(container);
    await screen.findByText("Found 3 questions in acme.csv");
    fireEvent.change(screen.getByDisplayValue("How are incidents reported?"), {
      target: { value: "How are incidents reported, and to whom?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue with 3 questions" }));
    const name = (await screen.findByLabelText("Name")) as HTMLInputElement;
    expect(name.value).toBe("acme");
    const rows = [...container.querySelectorAll("ol.qf-builder-rows > li")];
    expect(rows).toHaveLength(3);
    expect(rows[2].textContent).toContain("How are incidents reported, and to whom?");
    expect(screen.getByRole("button", { name: "Save question set" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ New question" })).toBeTruthy();
    // the set editor, not the questionnaire builder
    expect(container.querySelector(".qf-builder-forms")).toBeNull();
    expect(screen.queryByRole("region", { name: "Your questionnaire" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Use once" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Risks" })).toBeNull();
  });

  it('T49 D22 the set editor of an import offers "Also make a questionnaire with all its questions", unchecked', async () => {
    readQuestionSetFile.mockResolvedValue(found);
    const { container } = await mount();
    await upload(container);
    await screen.findByText("Found 3 questions in acme.csv");
    fireEvent.click(screen.getByRole("button", { name: "Continue with 3 questions" }));
    await screen.findByLabelText("Name");
    expect(also().checked).toBe(false);
  });

  it("T49 saving sends new questions with origin import and alsoQuestionnaire false", async () => {
    readQuestionSetFile.mockResolvedValue(found);
    saveQuestionSet.mockResolvedValue(undefined);
    const { container } = await mount();
    await upload(container, "Acme policy.docx");
    await screen.findByText("Found 3 questions in Acme policy.docx");
    fireEvent.click(screen.getByRole("button", { name: "Continue with 3 questions" }));
    expect(((await screen.findByLabelText("Name")) as HTMLInputElement).value).toBe("Acme policy");
    fireEvent.click(screen.getByRole("button", { name: "Save question set" }));
    await waitFor(() => expect(saveQuestionSet).toHaveBeenCalled());
    const [project, json, setId, opts] = saveQuestionSet.mock.calls[0];
    expect(project).toBe("mcas");
    expect(setId ?? undefined).toBeUndefined();
    expect(opts).toEqual({ origin: "import", alsoQuestionnaire: false });
    const draft = JSON.parse(json);
    expect(draft.name).toBe("Acme policy");
    expect(draft.questions).toEqual([
      { text: "Who signs off a model release?", citation: "Acme AI Policy §4.2", required: true, annexPoint: null },
      { text: "Which datasets are approved?", citation: "", required: false, annexPoint: null },
      { text: "How are incidents reported?", citation: "§7", required: false, annexPoint: null },
    ]);
    expect(container).toBeTruthy();
  });

  it("T49 ticking the box sends alsoQuestionnaire true", async () => {
    readQuestionSetFile.mockResolvedValue(found);
    saveQuestionSet.mockResolvedValue(undefined);
    const { container } = await mount();
    await upload(container);
    await screen.findByText("Found 3 questions in acme.csv");
    fireEvent.click(screen.getByRole("button", { name: "Continue with 3 questions" }));
    await screen.findByLabelText("Name");
    fireEvent.click(also());
    fireEvent.click(screen.getByRole("button", { name: "Save question set" }));
    await waitFor(() => expect(saveQuestionSet).toHaveBeenCalled());
    expect(saveQuestionSet.mock.calls[0][3]).toEqual({ origin: "import", alsoQuestionnaire: true });
  });

  it("T49 the import page stays the --form width through upload, preview and the set editor", async () => {
    readQuestionSetFile.mockResolvedValue(found);
    const { container } = await mount();
    const main = () => container.querySelector("main")!;
    expect(main().className).toBe("qualify-page qualify-page--form qf-forms-page");
    await upload(container);
    await screen.findByText("Found 3 questions in acme.csv");
    expect(main().className).toBe("qualify-page qualify-page--form qf-forms-page");
    fireEvent.click(screen.getByRole("button", { name: "Continue with 3 questions" }));
    await screen.findByLabelText("Name");
    expect(main().className).toBe("qualify-page qualify-page--form qf-forms-page");
  });
});

// ── 06 R59: the Annex column reaches the set editor ────────────────────────

describe("an imported file's Annex tags (T49, 06 R59)", () => {
  // what POST /forms/import answers for R50's example CSV
  const r50 = {
    ok: true,
    found: 2,
    format: "csv",
    questions: [
      { text: "Who signs off a model release?", citation: "Acme AI Policy §4.2", required: true, annexPoint: null },
      { text: "=Is SUM(A1) ok, or not?", citation: "", required: false, annexPoint: "2a" },
    ],
    warnings: [],
  };
  const selects = () => screen.getAllByLabelText("Answers Annex IV point") as HTMLSelectElement[];

  it('T49 R59 each preview row has an "Answers Annex IV point" select: None plus the 14 points by citation, preselected from the file', async () => {
    readQuestionSetFile.mockResolvedValue(r50);
    const { container } = await mount();
    await upload(container, "acme-ai-policy-v3.csv");
    await screen.findByText("Found 2 questions in acme-ai-policy-v3.csv");
    const all = selects();
    expect(all).toHaveLength(2);
    expect([...all[0].options].map((o) => o.textContent)).toEqual([
      "None",
      "Annex IV(1)(a)", "Annex IV(1)(b)", "Annex IV(1)(c)", "Annex IV(1)(d)-(e)", "Annex IV(1)(f)",
      "Annex IV(1)(g)-(h)", "Annex IV(2)(a)", "Annex IV(2)(b)", "Annex IV(2)(c)", "Annex IV(2)(d)",
      "Annex IV(2)(e)", "Annex IV(2)(f)", "Annex IV(2)(g)", "Annex IV(2)(h)",
    ]);
    expect(all.map((s) => s.selectedOptions[0].textContent)).toEqual(["None", "Annex IV(2)(a)"]);
  });

  it("T49 R59 the R50 example confirmed: new questions with annexPoint null and 2a, required true and false", async () => {
    readQuestionSetFile.mockResolvedValue(r50);
    saveQuestionSet.mockResolvedValue(undefined);
    const { container } = await mount();
    await upload(container, "acme-ai-policy-v3.csv");
    await screen.findByText("Found 2 questions in acme-ai-policy-v3.csv");
    fireEvent.click(screen.getByRole("button", { name: "Continue with 2 questions" }));
    await screen.findByLabelText("Name");
    fireEvent.click(screen.getByRole("button", { name: "Save question set" }));
    await waitFor(() => expect(saveQuestionSet).toHaveBeenCalled());
    expect(JSON.parse(saveQuestionSet.mock.calls[0][1]).questions).toEqual([
      { text: "Who signs off a model release?", citation: "Acme AI Policy §4.2", required: true, annexPoint: null },
      { text: "=Is SUM(A1) ok, or not?", citation: "", required: false, annexPoint: "2a" },
    ]);
  });

  it("T49 R59 the point chosen in the preview is the one that travels", async () => {
    readQuestionSetFile.mockResolvedValue(r50);
    saveQuestionSet.mockResolvedValue(undefined);
    const { container } = await mount();
    await upload(container, "acme.csv");
    await screen.findByText("Found 2 questions in acme.csv");
    const [first, second] = selects();
    fireEvent.change(first, { target: { value: [...first.options].find((o) => o.textContent === "Annex IV(2)(g)")!.value } });
    fireEvent.change(second, { target: { value: [...second.options].find((o) => o.textContent === "None")!.value } });
    fireEvent.click(screen.getByRole("button", { name: "Continue with 2 questions" }));
    await screen.findByLabelText("Name");
    fireEvent.click(screen.getByRole("button", { name: "Save question set" }));
    await waitFor(() => expect(saveQuestionSet).toHaveBeenCalled());
    expect(JSON.parse(saveQuestionSet.mock.calls[0][1]).questions.map((q: { annexPoint: unknown }) => q.annexPoint)).toEqual([
      "2g",
      null,
    ]);
  });
});
