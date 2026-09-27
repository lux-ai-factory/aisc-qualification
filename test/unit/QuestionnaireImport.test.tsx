// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { loadSrc, seededQuestion, setQuestion } from "../support/forms";

// Importing a questionnaire file (two-level forms,
// docs/superpowers/two-level-forms-2026-09-25/01-spec.md, T53 and T54, page part; T32 the page
// widths). A reference file whose set versions are all here opens the builder; one that names
// what this install lacks lists what is missing and stores nothing; a self-contained file shows
// its questions and makes a new question set and a questionnaire.
//
// Choices made here where the spec is silent (recorded in 02-tests.md):
//   QuestionnaireImport props: { project, groups: SetGroup[], header?: ReactNode }, and it renders the
//   page's <main> (as FormImport did, 06 R74);
//   the file input takes ".json"; readQuestionnaireFile(formData) gets the file under "file";
//   readQuestionnaireFile answers {ok:true, bundle:"references", open: BuilderInit} |
//   {ok:true, bundle:"self-contained", file, fileName} | {ok:false, error, missing?};
//   "Found <N> questions in <file name>" names the uploaded file;
//   importSelfContained(project, JSON.stringify(file), setName, questionnaireName).

const IMPORT = "app/p/[project]/questionnaires/import/QuestionnaireImport.tsx";

const { readQuestionnaireFile, importSelfContained, saveQuestionnaire } = vi.hoisted(() => ({
  readQuestionnaireFile: vi.fn(),
  importSelfContained: vi.fn(),
  saveQuestionnaire: vi.fn(),
}));
vi.mock("@/app/p/[project]/questionnaires/import/actions", () => ({ readQuestionnaireFile, importSelfContained }));
vi.mock("@/app/p/[project]/questionnaires/actions", () => ({
  saveQuestionnaire,
  useQuestionnaireOnce: vi.fn(),
  retireQuestionnaire: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

afterEach(cleanup);
beforeEach(() => {
  readQuestionnaireFile.mockReset();
  importSelfContained.mockReset();
  saveQuestionnaire.mockReset();
});

const acme1 = setQuestion("acme", "q1", { text: "Who signs off a model release?", citation: "Acme AI Policy §4.2" });
const annex2a = seededQuestion("2a");
const groups = [
  { setId: "annex-iv", setName: "Annex IV", versionId: "annex-iv-v1", versionNumber: 1, retired: false, questions: [annex2a] },
  { setId: "acme", setName: "Acme AI policy", versionId: "acme-v1", versionNumber: 1, retired: false, questions: [acme1] },
];

const MISSING = {
  ok: false,
  error:
    "This questionnaire refers to questions this install does not have. Import its self-contained file, or import those question sets first.",
  missing: [
    'Question set "Acme AI policy" (acme) v3 is not on this install.',
    's-acme:q9 is not in question set "Acme AI policy" v1.',
  ],
};
const REFERENCES = {
  ok: true,
  bundle: "references",
  open: {
    name: "Release review",
    description: "",
    blocks: ["risks"],
    origin: "import",
    picks: [
      { question: annex2a, setVersionId: "annex-iv-v1" },
      { question: acme1, setVersionId: "acme-v1" },
    ],
  },
};
const FILE = {
  format: "aisc-questionnaire",
  formatVersion: 1,
  bundle: "self-contained",
  name: "Acme AI policy",
  description: "",
  version: 3,
  blocks: ["risks"],
  items: [
    {
      setId: "acme", setName: "Acme AI policy", setVersion: 3, scope: "s-acme", localId: "q1",
      text: "Who signs off a model release?", citation: "Acme AI Policy §4.2", required: true, annexPoint: null, groupLabel: null,
    },
    {
      setId: "acme", setName: "Acme AI policy", setVersion: 3, scope: "s-acme", localId: "q2",
      text: "How are incidents reported?", citation: "", required: false, annexPoint: "2e", groupLabel: null,
    },
  ],
};
const SELF = { ok: true, bundle: "self-contained", file: FILE, fileName: "acme-ai-policy-v3.questionnaire.json" };

async function mount() {
  const { default: QuestionnaireImport } = await loadSrc(IMPORT);
  return render(<QuestionnaireImport project="mcas" groups={groups} header={<header><h1>Import a questionnaire</h1></header>} />);
}

async function upload(container: HTMLElement, name = "acme-ai-policy-v3.questionnaire.json") {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["{}"], name)] } });
  await waitFor(() => expect(readQuestionnaireFile).toHaveBeenCalled());
}

const main = () => document.querySelector("main") as HTMLElement;

describe("uploading a questionnaire file", () => {
  it("T53 takes .json files and sends the chosen one to readQuestionnaireFile under 'file'", async () => {
    readQuestionnaireFile.mockResolvedValue(MISSING);
    const { container } = await mount();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe(".json");
    await upload(container);
    const sent = readQuestionnaireFile.mock.calls[0][0] as FormData;
    expect((sent.get("file") as File).name).toBe("acme-ai-policy-v3.questionnaire.json");
  });

  it("T32 the page is --form while uploading", async () => {
    await mount();
    expect(main().className).toBe("qualify-page qualify-page--form qf-forms-page");
  });
});

describe("a reference file (T53)", () => {
  it("T53 anything missing: div.error with the message and ul.qf-import-missing with one li per entry, and no builder", async () => {
    readQuestionnaireFile.mockResolvedValue(MISSING);
    const { container } = await mount();
    await upload(container);
    await waitFor(() => expect(container.querySelector("div.error")?.textContent).toBe(MISSING.error));
    const items = [...container.querySelectorAll("ul.qf-import-missing li")].map((li) => li.textContent);
    expect(items).toEqual(MISSING.missing);
    expect(screen.queryByRole("region", { name: "Your questionnaire" })).toBeNull();
    expect(container.querySelector('input[type="file"]')).toBeTruthy();
    expect(saveQuestionnaire).not.toHaveBeenCalled();
    expect(importSelfContained).not.toHaveBeenCalled();
  });

  it("T53 T32 all found: the builder mounts with the resolved picks and the file's name, and the page turns --wide", async () => {
    readQuestionnaireFile.mockResolvedValue(REFERENCES);
    const { container } = await mount();
    await upload(container);
    const yours = await screen.findByRole("region", { name: "Your questionnaire" });
    expect(yours.textContent).toContain("Who signs off a model release?");
    expect(yours.textContent).toContain(annex2a.text);
    expect((screen.getByLabelText("Questionnaire name") as HTMLInputElement).value).toBe("Release review");
    expect(main().className).toBe("qualify-page qualify-page--wide qf-forms-page");
    // the header stays inside the same main
    expect(main().querySelector("h1")?.textContent).toBe("Import a questionnaire");
  });

  it("T53 the mounted builder saves with origin import, the items pinned as the file said", async () => {
    readQuestionnaireFile.mockResolvedValue(REFERENCES);
    saveQuestionnaire.mockResolvedValue(undefined);
    const { container } = await mount();
    await upload(container);
    await screen.findByRole("region", { name: "Your questionnaire" });
    fireEvent.click(screen.getByRole("button", { name: "Save questionnaire" }));
    await waitFor(() => expect(saveQuestionnaire).toHaveBeenCalled());
    const [project, json, id, origin] = saveQuestionnaire.mock.calls[0];
    expect(project).toBe("mcas");
    expect(id ?? undefined).toBeUndefined();
    expect(origin).toBe("import");
    expect(JSON.parse(json)).toEqual({
      name: "Release review",
      description: "",
      blocks: ["risks"],
      items: [
        { setVersionId: "annex-iv-v1", questionId: "annex-iv-2a" },
        { setVersionId: "acme-v1", questionId: "acme-q1" },
      ],
    });
  });

  it("T53 a file the prefill service refuses shows its error and nothing else", async () => {
    readQuestionnaireFile.mockResolvedValue({ ok: false, error: "this is not a questionnaire file: format must be aisc-questionnaire, formatVersion 1" });
    const { container } = await mount();
    await upload(container);
    await screen.findByText("this is not a questionnaire file: format must be aisc-questionnaire, formatVersion 1");
    expect(container.querySelector("ul.qf-import-missing")).toBeNull();
    expect(screen.queryByRole("region", { name: "Your questionnaire" })).toBeNull();
  });
});

describe("a self-contained file (T54)", () => {
  it("T54 shows Found <N> questions in <file name>, the questions read-only with their citation chips", async () => {
    readQuestionnaireFile.mockResolvedValue(SELF);
    const { container } = await mount();
    await upload(container);
    await screen.findByText("Found 2 questions in acme-ai-policy-v3.questionnaire.json");
    expect(container.textContent).toContain("Who signs off a model release?");
    expect(container.textContent).toContain("How are incidents reported?");
    const chips = [...container.querySelectorAll("span.qf-citation")].map((s) => s.textContent);
    expect(chips).toEqual(["Acme AI Policy §4.2"]);
    // read-only: the wording is not in any input
    expect(screen.queryByDisplayValue("Who signs off a model release?")).toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
    expect(screen.queryAllByRole("button", { name: /^Remove/ })).toEqual([]);
    expect(main().className).toBe("qualify-page qualify-page--form qf-forms-page");
  });

  it('T54 the two names default to "<file\'s name> questions" and the file\'s name', async () => {
    readQuestionnaireFile.mockResolvedValue(SELF);
    const { container } = await mount();
    await upload(container);
    const setName = (await screen.findByLabelText("Question set name")) as HTMLInputElement;
    const qName = screen.getByLabelText("Questionnaire name") as HTMLInputElement;
    expect(setName.value).toBe("Acme AI policy questions");
    expect(qName.value).toBe("Acme AI policy");
    expect(screen.getByRole("button", { name: "Create question set and questionnaire" })).toBeTruthy();
  });

  it("T54 the button calls importSelfContained(project, fileJson, setName, questionnaireName) with the names as edited", async () => {
    readQuestionnaireFile.mockResolvedValue(SELF);
    importSelfContained.mockResolvedValue(undefined);
    const { container } = await mount();
    await upload(container);
    fireEvent.change(await screen.findByLabelText("Question set name"), { target: { value: "Acme imported" } });
    fireEvent.click(screen.getByRole("button", { name: "Create question set and questionnaire" }));
    await waitFor(() => expect(importSelfContained).toHaveBeenCalled());
    const [project, fileJson, setName, questionnaireName] = importSelfContained.mock.calls[0];
    expect(project).toBe("mcas");
    expect(JSON.parse(fileJson)).toEqual(FILE);
    expect(setName).toBe("Acme imported");
    expect(questionnaireName).toBe("Acme AI policy");
    expect(saveQuestionnaire).not.toHaveBeenCalled();
  });

  it("T54 an error from importSelfContained shows in div.error and the preview stays", async () => {
    readQuestionnaireFile.mockResolvedValue(SELF);
    importSelfContained.mockResolvedValue({ error: "A questionnaire called Acme AI policy already exists." });
    const { container } = await mount();
    await upload(container);
    fireEvent.click(await screen.findByRole("button", { name: "Create question set and questionnaire" }));
    await waitFor(() =>
      expect(container.querySelector("div.error")?.textContent).toBe("A questionnaire called Acme AI policy already exists."),
    );
    expect(within(container).getByRole("button", { name: "Create question set and questionnaire" })).toBeTruthy();
  });
});
