// @vitest-environment jsdom
// The form pages' layout (docs/superpowers/form-assembly-2026-09-24/10-ui-plan.md, section 8),
// carried to the two levels of docs/superpowers/two-level-forms-2026-09-25/01-spec.md (8.3, T32):
// the markup hooks the CSS relies on, and guards on the CSS rules that answer them. Behaviour,
// labels and texts are pinned by the QuestionnairesPage, QuestionnaireBuilder, QuestionSetEditor,
// QuestionSetImport, QuestionnaireImport, FormChooser and FormLine tests; this file pins only
// structure and classes.
//
// Two-level forms (spec 8.3): the L tests target the questionnaires page; the B tests the
// questionnaire builder, except B6 (the question editor panel), which moved to the set editor;
// B7 expects Move and Remove only (no Edit); B8 reads "Update available". I1 and P3 target the
// question-set import (it mounts the set editor and stays --form); P3b the questionnaire import
// (it mounts the builder and turns --wide). The CSS pins B2, B3, B4, P4 are unchanged. The new
// pages and components are loaded at run time, so a missing module fails each test, not the file.
import { readFileSync } from "node:fs";
import type { ComponentProps } from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const {
  questionnaireService, questionSetService, saveQuestionnaire, useQuestionnaireOnce, retireQuestionnaire,
  readQuestionnaireFile, importSelfContained, saveQuestionSet, retireQuestionSet, readQuestionSetFile,
} = vi.hoisted(() => ({
  questionnaireService: { library: vi.fn(), chooserOptions: vi.fn(), resolve: vi.fn(), latestVersion: vi.fn() },
  questionSetService: { groups: vi.fn(), list: vi.fn(), latest: vi.fn(), atNumber: vi.fn() },
  saveQuestionnaire: vi.fn(),
  useQuestionnaireOnce: vi.fn(),
  retireQuestionnaire: vi.fn(),
  readQuestionnaireFile: vi.fn(),
  importSelfContained: vi.fn(),
  saveQuestionSet: vi.fn(),
  retireQuestionSet: vi.fn(),
  readQuestionSetFile: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/server/services/QuestionnaireService", () => ({ QuestionnaireService: class {}, questionnaireService }));
vi.mock("@/server/services/QuestionSetService", () => ({ QuestionSetService: class {}, questionSetService }));
vi.mock("@/app/p/[project]/questionnaires/actions", () => ({ saveQuestionnaire, useQuestionnaireOnce, retireQuestionnaire }));
vi.mock("@/app/p/[project]/questionnaires/import/actions", () => ({ readQuestionnaireFile, importSelfContained }));
vi.mock("@/app/p/[project]/question-sets/actions", () => ({ saveQuestionSet, retireQuestionSet }));
vi.mock("@/app/p/[project]/question-sets/import/actions", () => ({ readQuestionSetFile }));

import FormChooser from "@/app/p/[project]/system/edit/FormChooser";
import FormLine from "@/app/p/[project]/FormLine";
import { customQuestion, formVersion, loadSrc, seededQuestion, ALL_BLOCKS } from "../support/forms";

const css = readFileSync("src/app/globals.css", "utf8");

/** The declarations of one rule, by selector (as in widePage.test.ts). */
function rule(selector: string): string {
  const at = css.indexOf(selector + " {");
  expect(at, `${selector} must exist`).toBeGreaterThan(-1);
  return css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

// ── Questionnaires page (L) ────────────────────────────────────────────────

const ROWS = [
  { questionnaireId: "annex-iv-default", name: "Annex IV default", description: "EU AI Act Annex IV points 1 and 2.", origin: "builtin", builtin: true, isDefault: true, versionId: "annex-iv-default-v1", version: 1, questionCount: 14, savedBy: "system", savedAt: "2026-09-25T08:00:00.000Z", retiredAt: null, updates: 0 },
  { questionnaireId: "acme ai", name: "Acme AI policy", description: "", origin: "import", builtin: false, isDefault: false, versionId: "acme-v3", version: 3, questionCount: 18, savedBy: "alice", savedAt: "2026-09-24T10:00:00.000Z", retiredAt: null, updates: 0 },
];

async function mountLibrary() {
  questionnaireService.library.mockResolvedValue(ROWS);
  questionSetService.groups.mockResolvedValue([]);
  const { default: QuestionnairesPage } = await loadSrc("app/p/[project]/questionnaires/page.tsx");
  return render(
    await QuestionnairesPage({ params: Promise.resolve({ project: "a" }), searchParams: Promise.resolve({}) } as never),
  );
}

const rowOf = (name: string) => screen.getByText(name).closest("tr") as HTMLTableRowElement;

describe("L the questionnaires page", () => {
  it("L1 T34 is a qf-forms-table with 6 cells per row, whose cells are not flex boxes", async () => {
    const { container } = await mountLibrary();
    const table = container.querySelector("table")!;
    expect(table.classList.contains("qf-forms-table")).toBe(true);
    expect(table.classList.contains("onto-table")).toBe(false);
    const rows = [...table.querySelectorAll("tbody tr")];
    expect(rows).toHaveLength(2);
    for (const r of rows) expect([...r.children].filter((c) => c.tagName === "TD")).toHaveLength(6);
    expect(rule(".qf-forms-table td")).not.toMatch(/display:\s*flex/);
  });

  it("L2 the default row's name cell has the default tag; no other row does", async () => {
    await mountLibrary();
    const tag = rowOf("Annex IV default").querySelector("td span.qf-tag.qf-tag--default");
    expect(tag?.textContent).toBe("default");
    expect(rowOf("Acme AI policy").querySelector(".qf-tag--default")).toBeNull();
  });

  it("L3 the last cell holds every link and button of the row in div.qf-forms-actions, with no dots", async () => {
    await mountLibrary();
    for (const name of ["Annex IV default", "Acme AI policy"]) {
      const row = rowOf(name);
      const last = row.lastElementChild as HTMLElement;
      const box = last.querySelector("div.qf-forms-actions")!;
      expect(box).toBeTruthy();
      expect(row.querySelectorAll("a, button").length).toBe(box.querySelectorAll("a, button").length);
      expect(last.textContent).not.toContain("·");
    }
  });

  it('L4 "+ New questionnaire" is the primary header button, "Import questionnaire" and "Question sets" ghost ones, outside the intro', async () => {
    const { container } = await mountLibrary();
    const nw = screen.getByRole("link", { name: "+ New questionnaire" });
    const imp = screen.getByRole("link", { name: "Import questionnaire" });
    const sets = screen.getByRole("link", { name: "Question sets" });
    expect(nw.classList.contains("btn")).toBe(true);
    expect(nw.classList.contains("ghost")).toBe(false);
    for (const l of [imp, sets]) {
      expect(l.classList.contains("btn")).toBe(true);
      expect(l.classList.contains("ghost")).toBe(true);
    }
    for (const l of [nw, imp, sets]) {
      expect(l.closest(".qf-header-actions")).toBeTruthy();
      expect(container.querySelector("header p")!.contains(l)).toBe(false);
    }
  });

  it('L5 "Made by" reads Built in and Imported, not the stored values', async () => {
    const { container } = await mountLibrary();
    expect(rowOf("Annex IV default").textContent).toContain("Built in");
    expect(rowOf("Acme AI policy").textContent).toContain("Imported");
    const cells = [...container.querySelectorAll("td")].map((c) => c.textContent);
    expect(cells).not.toContain("builtin");
    expect(cells).not.toContain("import");
  });
});

// ── Builder (B) ────────────────────────────────────────────────────────────

const acme1 = customQuestion("acme", "q1", { text: "Who signs off a model release?", citation: "Acme AI Policy §4.2" });
const acme2 = customQuestion("acme", "q2", { text: "How are incidents reported?", citation: "" });
const acme3 = customQuestion("acme", "q3", {
  text: "Which datasets are approved for training and by whom are they signed?",
  citation: "Acme AI Policy §5.1",
  annexPoint: "2a" as never,
});
const annex1a = seededQuestion("1a");
const annex2a = seededQuestion("2a");
const groups = [
  { setId: "annex-iv", setName: "Annex IV", versionId: "annex-iv-v1", versionNumber: 1, retired: false, questions: [annex1a, annex2a] },
  { setId: "acme", setName: "Acme AI policy", versionId: "acme-v1", versionNumber: 1, retired: false, questions: [acme1, acme2, acme3] },
];

async function mountBuilder(initial: Record<string, unknown> = {}, gs: unknown[] = groups) {
  const { default: QuestionnaireBuilder } = await loadSrc("app/p/[project]/questionnaires/QuestionnaireBuilder.tsx");
  return render(<QuestionnaireBuilder project="mcas" groups={gs} initial={initial} />);
}
const left = () => screen.getByRole("region", { name: "Question library" });
const right = () => screen.getByRole("region", { name: "Your questionnaire" });
const hasClass = (el: Element | null, c: string) => !!el && el.classList.contains(c);
/** Tick a set in "Select question sets" (T27): its questions show, ticked. */
const selectSet = (name: RegExp) =>
  fireEvent.click(within(within(left()).getByRole("group", { name: "Select question sets" })).getByRole("checkbox", { name }));

describe("B the builder", () => {
  it("B1 T32 the root is a qualify-form qf-builder whose two children are the library and the questionnaire", async () => {
    const { container } = await mountBuilder();
    const root = container.firstElementChild!;
    expect(hasClass(root, "qualify-form")).toBe(true);
    expect(hasClass(root, "qf-builder")).toBe(true);
    expect([...root.children]).toEqual([left(), right()]);
  });

  it("B2 CSS: a two-column grid, a sticky form column, one column under 960px", () => {
    expect(rule(".qf-builder")).toMatch(/grid-template-columns:/);
    expect(rule(".qf-builder-form")).toMatch(/position: sticky/);
    const media = css.slice(css.indexOf("@media (max-width: 960px)"));
    expect(css.indexOf("@media (max-width: 960px)")).toBeGreaterThan(-1);
    expect(media.slice(0, 400)).toMatch(/\.qf-builder\s*\{\s*grid-template-columns: 1fr;/);
  });

  it("B3 each library question checkbox leads a label.qf-builder-pick; text and citation are separate spans", async () => {
    await mountBuilder();
    selectSet(/^Annex IV/);
    selectSet(/^Acme AI policy/);
    const boxes = [...left().querySelectorAll(".qf-builder-groups input[type='checkbox']")];
    expect(boxes).toHaveLength(5);
    for (const box of boxes) {
      const label = box.parentElement!;
      expect(label.tagName).toBe("LABEL");
      expect(hasClass(label, "qf-builder-pick")).toBe(true);
      expect(label.firstElementChild).toBe(box);
      // the checkbox and one body box are the label's only children: the grid's two columns
      expect(label.children).toHaveLength(2);
      expect(hasClass(label.children[1], "qf-builder-pick-body")).toBe(true);
      const text = label.querySelector("span.qf-question-text")!;
      const chip = label.querySelector("span.qf-citation");
      if (chip) {
        expect(hasClass(chip.parentElement, "qf-builder-chips")).toBe(true);
        expect(chip).not.toBe(text);
        expect(text.textContent).not.toContain(chip.textContent!);
      }
    }
  });

  it("B4 T27 no qf-row; the set multi-select is a fieldset.qf-builder-forms of toggle chips in the toolbar", async () => {
    const { container } = await mountBuilder();
    expect(container.querySelector(".qf-row")).toBeNull();
    expect(container.querySelector(".qf-builder-startfrom")).toBeNull();
    const set = within(left()).getByRole("group", { name: "Select question sets" });
    expect(set.tagName).toBe("FIELDSET");
    expect(hasClass(set, "qf-builder-forms")).toBe(true);
    expect(set.closest(".qf-builder-toolbar")).toBeTruthy();
    const boxes = within(set).getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    for (const box of boxes) {
      const chip = box.parentElement!;
      expect(chip.tagName).toBe("LABEL");
      expect(hasClass(chip, "qf-builder-formchip")).toBe(true);
      expect(chip.firstElementChild).toBe(box);
      expect(chip.querySelector("span.qf-builder-formchip-name")).toBeTruthy();
      expect(chip.querySelector("span.qf-builder-formchip-meta")).toBeTruthy();
    }
    // with nothing selected, the prompt stands where the groups go
    expect(hasClass(left().querySelector("p.qf-builder-prompt"), "qf-builder-empty")).toBe(true);
    // the chip look: the block chip's, primary when on
    expect(rule(".qf-builder-formchip:has(input:checked)")).toMatch(/border-color: var\(--primary\)/);
  });

  it("B5 three locked identity chips with no input; every block checkbox in a block chip", async () => {
    await mountBuilder();
    const identity = right().querySelector(".qf-builder-identity")!;
    const locked = identity.querySelectorAll(".qf-builder-locked");
    expect(locked).toHaveLength(3);
    expect(identity.querySelector("input")).toBeNull();
    const blocks = [...right().querySelectorAll(".qf-builder-blocks input[type='checkbox']")];
    expect(blocks.length).toBe(9);
    for (const b of blocks) expect(hasClass(b.parentElement, "qf-builder-block")).toBe(true);
  });

  it("B6 T28 the builder has no question editor and no + New question; its footer ends with Save questionnaire after the ghost Use once", async () => {
    const { container } = await mountBuilder();
    expect(screen.queryByRole("button", { name: "+ New question" })).toBeNull();
    expect(container.querySelector(".qf-builder-editor")).toBeNull();
    const footer = container.querySelector(".qf-builder-footer")!;
    const save = within(footer as HTMLElement).getByRole("button", { name: "Save questionnaire" });
    const once = within(footer as HTMLElement).getByRole("button", { name: "Use once" });
    expect(hasClass(save, "btn") && !hasClass(save, "ghost")).toBe(true);
    expect(hasClass(once, "btn") && hasClass(once, "ghost")).toBe(true);
    expect(footer.lastElementChild).toBe(save);
  });

  it("B6 T17 the question editor is its own panel in the set editor, with small buttons, apart from its footer", async () => {
    const { default: NewQuestionSetPage } = await loadSrc("app/p/[project]/question-sets/new/page.tsx");
    const { container } = render(
      await NewQuestionSetPage({ params: Promise.resolve({ project: "mcas" }), searchParams: Promise.resolve({}) } as never),
    );
    expect(container.querySelector(".qf-builder-editor")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "+ New question" }));
    const editor = container.querySelector(".qf-builder-editor")!;
    expect(editor).toBeTruthy();
    const save = within(editor as HTMLElement).getByRole("button", { name: "Save question" });
    const cancel = within(editor as HTMLElement).getByRole("button", { name: "Cancel" });
    expect(hasClass(save, "btn") && !hasClass(save, "ghost")).toBe(true);
    expect(hasClass(cancel, "btn") && hasClass(cancel, "ghost")).toBe(true);
    const footer = container.querySelector(".qf-builder-footer")!;
    expect(footer.contains(save) || footer.contains(cancel)).toBe(false);
    const saveSet = within(footer as HTMLElement).getByRole("button", { name: "Save question set" });
    expect(hasClass(saveSet, "btn") && !hasClass(saveSet, "ghost")).toBe(true);
    expect(footer.lastElementChild).toBe(saveSet);
    // the set editor's rows are the builder's row classes (spec 5.3 CSS)
    fireEvent.change(editor.querySelector("textarea")!, { target: { value: "Who may retrain the model?" } });
    fireEvent.click(save);
    expect(container.querySelector("ol.qf-builder-rows li.qf-builder-row")).toBeTruthy();
  });

  it("B7 T28 a picked row's move and Remove are text tools in .qf-builder-actions; there is no Edit", async () => {
    await mountBuilder();
    selectSet(/^Acme AI policy/);
    const col = right();
    expect(within(col).queryAllByRole("button", { name: /^Edit/ })).toEqual([]);
    const tools = [
      ...within(col).getAllByRole("button", { name: /^Move / }),
      ...within(col).getAllByRole("button", { name: /^Remove/ }),
    ];
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) {
      expect(t.closest(".qf-builder-actions")).toBeTruthy();
      expect(hasClass(t, "qf-builder-tool")).toBe(true);
      expect(hasClass(t, "btn")).toBe(false);
    }
  });

  it('B8 T29 "Update available", the new wording and its button share one .qf-builder-update box', async () => {
    const newer = { ...acme3, text: "Which datasets may be used for training, and who signs them off?", setVersionId: "acme-v2", setVersionNumber: 2 };
    const gs = [
      groups[0],
      { setId: "acme", setName: "Acme AI policy", versionId: "acme-v2", versionNumber: 2, retired: false, questions: [acme1, acme2, newer] },
    ];
    const q = formVersion({ questionnaireId: "qq", questionnaireName: "Questionnaire Q", versionId: "qq-v1", versionNumber: 1, blocks: ["risks"] as never, questions: [acme1, acme3] });
    await mountBuilder({ edit: q }, gs);
    const col = right();
    const tag = [...col.querySelectorAll("span.qf-tag")].find((t) => t.textContent === "Update available")!;
    expect(tag).toBeTruthy();
    expect(hasClass(tag, "qf-tag--notice")).toBe(true);
    const box = tag.closest(".qf-builder-update")!;
    expect(box).toBeTruthy();
    expect(box.contains(col.querySelector("p.qf-new-wording"))).toBe(true);
    expect(box.contains(within(col).getByRole("button", { name: /^Accept the update of/ }))).toBe(true);
  });
});

// ── Import (I) ─────────────────────────────────────────────────────────────

const PREVIEW = {
  ok: true,
  found: 2,
  questions: [
    { text: "Who signs off a model release?", citation: "Acme AI Policy §4.2", required: true },
    { text: "How are incidents reported?", citation: "", required: false },
  ],
  warnings: ["Skipped 1 heading."],
};

async function mountSetImport() {
  const { default: QuestionSetImport } = await loadSrc("app/p/[project]/question-sets/import/QuestionSetImport.tsx");
  return render(<QuestionSetImport project="mcas" />);
}

describe("I the import preview", () => {
  it("I1 T49 rows are li.qf-import-row in ol.qf-import-rows, and nothing is a qf-row", async () => {
    readQuestionSetFile.mockResolvedValue(PREVIEW);
    const { container } = await mountSetImport();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "acme.csv")] } });
    await waitFor(() => expect(readQuestionSetFile).toHaveBeenCalled());
    await screen.findByText("Found 2 questions in acme.csv");
    const rows = [...container.querySelectorAll(".qf-import-row")];
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.tagName).toBe("LI");
      expect(hasClass(r.parentElement, "qf-import-rows")).toBe(true);
      expect(r.parentElement!.tagName).toBe("OL");
    }
    expect(container.querySelector(".qf-row")).toBeNull();
  });
});

// ── Chooser (C) ────────────────────────────────────────────────────────────

describe("C the chooser", () => {
  it("C1 T36 each option's tags sit in .qf-chooser-tags; the default tag is a qf-tag--default", () => {
    // Props are cast: their exact shape is pinned by FormChooser.test.tsx (T36, T38), not here.
    const options = [
      { questionnaireId: "annex-iv-default", name: "Annex IV default", versionId: "annex-iv-default-v1", version: 1, versionNumber: 1, questionCount: 14, isDefault: true, versionIds: ["annex-iv-default-v1"] },
      { questionnaireId: "acme", name: "Acme AI policy", versionId: "acme-v3", version: 3, versionNumber: 3, questionCount: 18, isDefault: false, versionIds: ["acme-v3"] },
    ];
    const props = {
      project: "mcas",
      options,
      preselected: { param: "questionnaire", id: "annex-iv-default" },
      // the previous card was filled with the default's latest version: its option carries "same as v4" (T38)
      previous: { cardVersionNumber: 4, versionId: "annex-iv-default-v1", name: "Annex IV default", versionNumber: 1 },
    };
    const { container } = render(<FormChooser {...(props as unknown as ComponentProps<typeof FormChooser>)} />);
    const tags = [...container.querySelectorAll("label.qf-chooser-option .qf-tag")];
    expect(tags.length).toBe(2);
    for (const t of tags) expect(hasClass(t.parentElement, "qf-chooser-tags")).toBe(true);
    const def = tags.find((t) => t.textContent!.trim() === "default")!;
    expect(def).toBeTruthy();
    expect(hasClass(def, "qf-tag--default")).toBe(true);
  });
});

// ── FormLine (F) ───────────────────────────────────────────────────────────

describe("F the questionnaire line", () => {
  it("F1 T42 the three dots between the name and the JSON, CSV and Markdown links are span.qf-row-form-sep", () => {
    // Props are cast: their exact shape is pinned by FormLine.test.tsx (T42), not here.
    const form = formVersion({ questionnaireId: "acme", questionnaireName: "Acme AI policy", versionId: "acme-v3", versionNumber: 3 });
    const props = { project: "demo", form, questionnaireId: "acme", name: "Acme AI policy", versionNumber: 3 };
    const { container } = render(<FormLine {...(props as unknown as ComponentProps<typeof FormLine>)} />);
    const seps = [...container.querySelectorAll("p.qf-row-form span.qf-row-form-sep")];
    expect(seps).toHaveLength(3);
    for (const s of seps) expect(s.textContent!.trim()).toBe("·");
  });
});

// ── Page shells (P) ────────────────────────────────────────────────────────

const PAGES = {
  library: "src/app/p/[project]/questionnaires/page.tsx",
  new: "src/app/p/[project]/questionnaires/new/page.tsx",
  edit: "src/app/p/[project]/questionnaires/[questionnaireId]/edit/page.tsx",
  import: "src/app/p/[project]/questionnaires/import/page.tsx",
  setImport: "src/app/p/[project]/question-sets/import/page.tsx",
};
const source = (path: string) => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new Error(`${path} does not exist yet`);
  }
};

describe("P the page shells", () => {
  it("P1 T32 the questionnaires page is the --form width; the new and edit builder pages are --wide; all are qf-forms-page", () => {
    const library = source(PAGES.library);
    expect(library).toContain('className="qualify-page qualify-page--form qf-forms-page"');
    expect(library).not.toContain("qualify-page--wide");
    for (const path of [PAGES.new, PAGES.edit]) {
      const src = source(path);
      expect(src, path).toContain('className="qualify-page qualify-page--wide qf-forms-page"');
      expect(src, path).not.toContain("qualify-page--form");
    }
  });

  it("P3 T32 T49 the question-set import is --form while uploading, previewing and in the set editor", async () => {
    readQuestionSetFile.mockResolvedValue({
      ok: true,
      found: 1,
      questions: [{ text: "Who signs off a model release?", citation: "", required: true }],
      warnings: [],
    });
    const { container } = await mountSetImport();
    const main = () => container.querySelector("main")!;
    expect(main().className).toBe("qualify-page qualify-page--form qf-forms-page");
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "acme.csv")] } });
    await screen.findByText("Found 1 questions in acme.csv");
    expect(main().className).toBe("qualify-page qualify-page--form qf-forms-page");
    fireEvent.click(screen.getByRole("button", { name: "Continue with 1 questions" }));
    expect(main().className).toBe("qualify-page qualify-page--form qf-forms-page");
    expect(main().querySelector("ol.qf-builder-rows")).toBeTruthy();
    // the page hands QuestionSetImport its header, so the crumb is inside the same main
    expect(source(PAGES.setImport)).not.toContain("<main");
  });

  it("P3b T32 T53 the questionnaire import is --form while uploading, --wide once the builder mounts", async () => {
    readQuestionnaireFile.mockResolvedValue({
      ok: true,
      bundle: "references",
      open: {
        name: "Imported",
        blocks: [...ALL_BLOCKS],
        origin: "import",
        picks: [{ question: annex2a, setVersionId: "annex-iv-v1" }],
      },
    });
    const { default: QuestionnaireImport } = await loadSrc("app/p/[project]/questionnaires/import/QuestionnaireImport.tsx");
    const props = { project: "mcas", groups };
    const { container } = render(<QuestionnaireImport {...props} />);
    const main = () => container.querySelector("main")!;
    expect(main().className).toBe("qualify-page qualify-page--form qf-forms-page");
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["{}"], "q.questionnaire.json")] } });
    await waitFor(() => expect(main().querySelector(".qf-builder")).toBeTruthy());
    expect(main().className).toBe("qualify-page qualify-page--wide qf-forms-page");
    expect(source(PAGES.import)).not.toContain("<main");
  });

  it("P4 CSS: on a wide page the builder's form column grows, above the 960px breakpoint only", () => {
    const at = css.indexOf("@media (min-width: 961px)");
    expect(at).toBeGreaterThan(-1);
    const block = css.slice(at, css.indexOf("}\n}", at) + 3);
    expect(block).toMatch(/\.qualify-page--wide \.qf-builder \{\s*grid-template-columns: minmax\(0, 1fr\) minmax\(380px, 560px\);/);
  });

  it("P2 the new, edit and import questionnaire pages have a crumb back to the questionnaires", () => {
    for (const path of [PAGES.new, PAGES.edit, PAGES.import]) {
      const src = source(path);
      expect(src, path).toMatch(/className="qf-crumb"/);
      expect(src, path).toContain("href={`/p/${project}/questionnaires`}");
    }
  });
});
