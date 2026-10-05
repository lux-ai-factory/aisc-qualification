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
import { METADATA_FIELDS } from "@/data/formFields";
import {
  ALL_BLOCKS,
  loadSrc,
  questionnaireVersion,
  seededQuestion,
  setQuestion,
} from "../support/forms";

// The questionnaire builder: the question-set library on the left, the questionnaire being
// assembled on the right. A questionnaire only picks questions from set versions; it never
// writes or rewords one ("+ New question" is tested in QuestionSetEditor.test.tsx).
//
// What these tests rely on:
//   the left column is <section aria-label="Question library">;
//   the question checkboxes of the selected groups sit under `.qf-builder-groups`;
//   each group is headed by an h3 with the set's name;
//   the builder imports its actions from "./actions" (questionnaires/actions.ts);
//   saving calls saveQuestionnaire(project, JSON.stringify(draft), questionnaireId | undefined, origin)
//   and useQuestionnaireOnce(project, JSON.stringify(draft), origin).

const BUILDER = "app/p/[project]/questionnaires/QuestionnaireBuilder.tsx";

const { saveQuestionnaire, useQuestionnaireOnce, retireQuestionnaire } =
  vi.hoisted(() => ({
    saveQuestionnaire: vi.fn(),
    useQuestionnaireOnce: vi.fn(),
    retireQuestionnaire: vi.fn(),
  }));
vi.mock("@/app/p/[project]/questionnaires/actions", () => ({
  saveQuestionnaire,
  useQuestionnaireOnce,
  retireQuestionnaire,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(cleanup);
beforeEach(() => {
  saveQuestionnaire.mockReset();
  useQuestionnaireOnce.mockReset();
});

// The library: three current sets and one retired

const acme1 = setQuestion("acme", "q1", {
  text: "Who signs off a model release?",
  citation: "Acme AI Policy §4.2",
  setVersionId: "acme-v2",
  setVersionNumber: 2,
});
const acme2 = setQuestion("acme", "q2", {
  text: "How are incidents reported?",
  citation: "",
  required: false,
  setVersionId: "acme-v2",
  setVersionNumber: 2,
});
const acme3 = setQuestion("acme", "q3", {
  text: "Which datasets are approved for training and by whom are they signed?",
  citation: "Acme AI Policy §5.1",
  annexPoint: "2a" as never,
  setVersionId: "acme-v2",
  setVersionNumber: 2,
});
const zeta1 = setQuestion("zeta", "q1", {
  text: "Is the model card published?",
  citation: "Zeta §1",
  setName: "Zeta",
  setVersionId: "zeta-v1",
});
const old1 = setQuestion("old", "q1", {
  text: "A question of a retired set?",
  setName: "Old set",
  setVersionId: "old-v1",
});
const annex1a = seededQuestion("1a");
const annex2a = seededQuestion("2a");

const annexGroup = {
  setId: "annex-iv",
  setName: "Annex IV",
  versionId: "annex-iv-v1",
  versionNumber: 1,
  retired: false,
  questions: [annex1a, annex2a],
};
const acmeGroup = {
  setId: "acme",
  setName: "Acme AI policy",
  versionId: "acme-v2",
  versionNumber: 2,
  retired: false,
  questions: [acme1, acme2, acme3],
};
const oldGroup = {
  setId: "old",
  setName: "Old set",
  versionId: "old-v1",
  versionNumber: 1,
  retired: true,
  questions: [old1],
};
const zetaGroup = {
  setId: "zeta",
  setName: "Zeta",
  versionId: "zeta-v1",
  versionNumber: 1,
  retired: false,
  questions: [zeta1],
};
/** As QuestionSetService.groups() returns them: Annex IV, then by name; retired included. */
const groups = [annexGroup, acmeGroup, oldGroup, zetaGroup];

async function mount(
  initial: Record<string, unknown> = {},
  gs: unknown[] = groups,
) {
  const { default: QuestionnaireBuilder } = await loadSrc(BUILDER);
  return render(
    <QuestionnaireBuilder project="mcas" groups={gs} initial={initial} />,
  );
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const left = () => screen.getByRole("region", { name: "Question library" });
const right = () => screen.getByRole("region", { name: "Your questionnaire" });
const setsBox = () =>
  screen.getByRole("group", { name: "Select question sets" });
const setBox = (name: string) =>
  within(setsBox()).getByRole("checkbox", {
    name: new RegExp("^" + escape(name)),
  }) as HTMLInputElement;
const select = (name: string) => fireEvent.click(setBox(name));
const questionBoxes = () =>
  [
    ...document.querySelectorAll(".qf-builder-groups input[type='checkbox']"),
  ] as HTMLInputElement[];
const tick = (text: string) =>
  fireEvent.click(
    within(left()).getByRole("checkbox", { name: new RegExp(escape(text)) }),
  );
const groupHeadings = () =>
  [...document.querySelectorAll(".qf-builder-groups h3")].map(
    (h) => h.textContent,
  );
const rowOrder = () =>
  [...right().querySelectorAll("button[aria-label^='Move ']")]
    .filter((b) => b.getAttribute("aria-label")!.endsWith(" up"))
    .map((b) =>
      b
        .getAttribute("aria-label")!
        .replace(/^Move /, "")
        .replace(/ up$/, ""),
    );
const rowOf = (text: string) =>
  within(right())
    .getByRole("button", {
      name: new RegExp("^Move " + escape(text.slice(0, 40).trimEnd()) + " up$"),
    })
    .closest("li") as HTMLElement;
const short = (text: string) => text.slice(0, 40).trimEnd();

/** Every current set selected, every question unticked: the library on show, an empty questionnaire. */
async function browse(initial: Record<string, unknown> = {}) {
  const r = await mount(initial);
  select("Annex IV");
  select("Acme AI policy");
  select("Zeta");
  for (const box of questionBoxes()) if (box.checked) fireEvent.click(box);
  return r;
}

// The library column selects question-set versions

describe("the library column (T27)", () => {
  it('T27 "Select question sets" has one chip per non-retired set, Annex IV first then by name, each "v<N> · <count> questions"', async () => {
    await mount();
    const box = setsBox();
    expect(box.tagName).toBe("FIELDSET");
    expect(box.classList.contains("qf-builder-forms")).toBe(true);
    const chips = [...box.querySelectorAll("label.qf-builder-formchip")].map(
      (l) => l.textContent,
    );
    expect(chips).toEqual([
      "Annex IVv1 · 2 questions",
      "Acme AI policyv2 · 3 questions",
      "Zetav1 · 1 question",
    ]);
    for (const b of within(box).getAllByRole("checkbox"))
      expect((b as HTMLInputElement).checked).toBe(false);
  });

  it("T27 a retired set has no chip, and its questions are nowhere in the library", async () => {
    await mount();
    expect(
      within(setsBox()).queryByRole("checkbox", { name: /^Old set/ }),
    ).toBeNull();
    expect(document.body.textContent).not.toContain(
      "A question of a retired set?",
    );
  });

  it("T27 with no set selected the library shows the prompt and no question, whatever the search", async () => {
    await mount();
    expect(left().querySelector("p.qf-builder-prompt")?.textContent).toBe(
      "Select one or more question sets to see their questions.",
    );
    expect(questionBoxes()).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Search questions"), {
      target: { value: "incidents" },
    });
    expect(questionBoxes()).toHaveLength(0);
    expect(left().querySelector("p.qf-builder-prompt")).toBeTruthy();
  });

  it("T27 selecting a set ticks all its questions, appended in its order, pinned to its latest version", async () => {
    await mount();
    select("Acme AI policy");
    expect(setBox("Acme AI policy").checked).toBe(true);
    expect(groupHeadings()).toEqual(["Acme AI policy"]);
    expect(questionBoxes().map((b) => b.checked)).toEqual([true, true, true]);
    expect(left().querySelector("p.qf-builder-prompt")).toBeNull();
    expect(rowOrder()).toEqual([
      short(acme1.text),
      short(acme2.text),
      short(acme3.text),
    ]);
    const owners = [...right().querySelectorAll("span.qf-builder-owner")].map(
      (s) => s.textContent,
    );
    expect(owners).toEqual([
      "Acme AI policy v2",
      "Acme AI policy v2",
      "Acme AI policy v2",
    ]);
  });

  it("T27 R76 groups show in the order the sets were selected, each under the ones before it", async () => {
    await mount();
    select("Zeta");
    select("Annex IV");
    expect(groupHeadings()).toEqual(["Zeta", "Annex IV"]);
    expect(rowOrder()).toEqual([
      short(zeta1.text),
      short(annex1a.text),
      short(annex2a.text),
    ]);
  });

  it("T27 R77 unselecting a set removes its group and every pick that came with it", async () => {
    await mount();
    select("Annex IV");
    select("Acme AI policy");
    select("Acme AI policy");
    expect(setBox("Acme AI policy").checked).toBe(false);
    expect(groupHeadings()).toEqual(["Annex IV"]);
    expect(rowOrder()).toEqual([short(annex1a.text), short(annex2a.text)]);
  });

  it("T27 R78 unticking keeps the set selected; ticking again puts the question back in the set's order", async () => {
    await mount();
    select("Acme AI policy");
    tick("How are incidents reported?");
    expect(setBox("Acme AI policy").checked).toBe(true);
    expect(rowOrder()).toEqual([short(acme1.text), short(acme3.text)]);
    tick("How are incidents reported?");
    expect(rowOrder()).toEqual([
      short(acme1.text),
      short(acme2.text),
      short(acme3.text),
    ]);
  });

  it("T27 R16 ticking appends the question; unticking removes it", async () => {
    await browse();
    tick("Who signs off a model release?");
    expect(right().textContent).toContain("Who signs off a model release?");
    const box = within(left()).getByRole("checkbox", {
      name: /Who signs off/,
    }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(right().textContent).not.toContain("Who signs off a model release?");
  });

  it("T27 R16 each library question shows its text and citation chip; none without a citation", async () => {
    await browse();
    const chips = [...left().querySelectorAll("span.qf-citation")].map(
      (s) => s.textContent,
    );
    expect(chips).toContain("Acme AI Policy §4.2");
    expect(chips).toContain("Annex IV(2)(a)");
    const row = within(left())
      .getByRole("checkbox", { name: /How are incidents reported/ })
      .closest("li, label, div")!;
    expect(row.querySelector("span.qf-citation")).toBeNull();
  });

  it('T27 "Search questions" filters by text or citation within the selected sets, dropping groups with no match', async () => {
    await browse();
    fireEvent.change(screen.getByLabelText("Search questions"), {
      target: { value: "  INCIDENTS  " },
    });
    expect(questionBoxes()).toHaveLength(1);
    expect(groupHeadings()).toEqual(["Acme AI policy"]);
    fireEvent.change(screen.getByLabelText("Search questions"), {
      target: { value: "§5.1" },
    });
    expect(questionBoxes()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Search questions"), {
      target: { value: "" },
    });
    select("Zeta");
    fireEvent.change(screen.getByLabelText("Search questions"), {
      target: { value: "model card" },
    });
    expect(questionBoxes()).toHaveLength(0);
  });
});

// The questionnaire column: locked identity, blocks, picks only

describe("the questionnaire column (T28)", () => {
  const three = async () => {
    await browse();
    tick("Who signs off a model release?");
    tick("Which datasets are approved");
    tick("How are incidents reported?");
    // ticked inside the Acme group, q2 lands in Acme's order: q1, q2, q3; one move gives q1, q3, q2
    fireEvent.click(
      screen.getByRole("button", {
        name: "Move How are incidents reported? down",
      }),
    );
  };

  it('T28 a new questionnaire has the input "Questionnaire name" (maxLength 120)', async () => {
    await mount();
    const name = within(right()).getByLabelText(
      "Questionnaire name",
    ) as HTMLInputElement;
    expect(name.maxLength).toBe(120);
  });

  it("T28 an existing questionnaire shows its name as h2 and no name input", async () => {
    await mount({
      edit: questionnaireVersion({
        questionnaireName: "Acme review",
        versionNumber: 2,
        versionId: "qa-v2",
      }),
    });
    expect(
      within(right()).getByRole("heading", { level: 2, name: "Acme review" }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Questionnaire name")).toBeNull();
  });

  it("T28 R21 the identity is always included with no control, and every block has its own checkbox", async () => {
    await mount();
    expect(right().textContent).toContain(
      "Always included: System name, Version, Company (provider)",
    );
    const blockLabels = [
      ...(
        [
          "description",
          "targetUseCase",
          "targetUsers",
          "intendedDeployers",
          "targetSystemTags",
          "sectorTags",
          "marketFormTags",
          "localityTags",
        ] as const
      ).map((id) => METADATA_FIELDS[id].label),
      "Risks",
    ];
    for (const label of blockLabels) {
      expect(
        within(right()).getByRole("checkbox", { name: label }),
        label,
      ).toBeTruthy();
    }
    for (const fixed of ["System name", "Version", "Company (provider)"]) {
      expect(
        within(right()).queryByRole("checkbox", { name: fixed }),
      ).toBeNull();
    }
  });

  it('T28 the questions heading is "Questions (<n>)"', async () => {
    await three();
    expect(
      within(right()).getByRole("heading", { level: 3, name: "Questions (3)" }),
    ).toBeTruthy();
  });

  it("T28 each row shows its text, citation chip, pinned set version, Required/Optional and Remove", async () => {
    await three();
    const row = rowOf(acme1.text);
    expect(row.textContent).toContain("Who signs off a model release?");
    expect(row.querySelector("span.qf-citation")?.textContent).toBe(
      "Acme AI Policy §4.2",
    );
    expect(row.querySelector("span.qf-builder-owner")?.textContent).toBe(
      "Acme AI policy v2",
    );
    expect(
      [...row.querySelectorAll("span.qf-tag")].map((t) => t.textContent),
    ).toContain("Required");
    expect(
      [...rowOf(acme2.text).querySelectorAll("span.qf-tag")].map(
        (t) => t.textContent,
      ),
    ).toContain("Optional");
    expect(within(row).getByRole("button", { name: /^Remove/ })).toBeTruthy();
  });

  it('T28 there is no "Edit" on any row and no "+ New question" anywhere in the builder', async () => {
    await three();
    expect(screen.queryAllByRole("button", { name: /^Edit/ })).toEqual([]);
    expect(screen.queryAllByRole("link", { name: /^Edit/ })).toEqual([]);
    expect(screen.queryByRole("button", { name: "+ New question" })).toBeNull();
    expect(document.body.textContent).not.toContain("+ New question");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it('T28 "Questions are written in question sets." links to writing a question set', async () => {
    const { container } = await mount();
    const p = container.querySelector("p.qf-builder-author") as HTMLElement;
    expect(p.textContent).toMatch(
      /^Questions are written in question sets\. ?Write a question set$/,
    );
    const link = within(p).getByRole("link", { name: "Write a question set" });
    expect(link.getAttribute("href")).toBe("/p/mcas/question-sets/new");
  });

  it("T28 the empty questionnaire's hint points at the library", async () => {
    await mount();
    expect(right().querySelector("p.qf-builder-empty")?.textContent).toBe(
      "No questions yet. Select a question set in the library.",
    );
  });

  it("T28 R18 Move up / Move down are named after the first 40 characters; the ends are disabled", async () => {
    await three();
    expect(
      screen.getByRole("button", {
        name: "Move Who signs off a model release? up",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Move Which datasets are approved for training down",
      }),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Move Who signs off a model release? up",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Move How are incidents reported? down",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("T28 R18 a move shifts the row by one and keeps focus on the moved row's same button", async () => {
    await three();
    const down = screen.getByRole("button", {
      name: "Move Who signs off a model release? down",
    });
    down.focus();
    fireEvent.click(down);
    expect(rowOrder()).toEqual([
      short(acme3.text),
      short(acme1.text),
      short(acme2.text),
    ]);
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Move Who signs off a model release? down",
    );
  });

  it("T28 R18 rows are draggable", async () => {
    await three();
    expect(right().querySelectorAll("[draggable='true']").length).toBe(3);
  });

  it("T28 Remove removes a row", async () => {
    await three();
    fireEvent.click(
      within(rowOf(acme1.text)).getByRole("button", { name: /^Remove/ }),
    );
    expect(right().textContent).not.toContain("Who signs off a model release?");
  });

  it("T28 R23 two questions on the same Annex point each show the overlap chip", async () => {
    await browse();
    tick("How was the system built");
    tick("Which datasets are approved");
    expect(
      within(right()).getAllByText("≈ overlaps Annex IV(2)(a)"),
    ).toHaveLength(2);
    expect(
      within(left()).getAllByText("≈ overlaps Annex IV(2)(a)").length,
    ).toBeGreaterThan(0);
  });
});

// "Update available" and accepting it

describe('"Update available" (T29)', () => {
  // Questionnaire Q v1 pinned three Acme questions to acme-v1; acme is at v2 since:
  // q1 has the same wording, q3 is reworded, q4 was removed.
  const q1v1 = { ...acme1, setVersionId: "acme-v1", setVersionNumber: 1 };
  const q3v1 = {
    ...acme3,
    text: "Which datasets are allowed for training, and who signs them off?",
    setVersionId: "acme-v1",
    setVersionNumber: 1,
  };
  const q4v1 = setQuestion("acme", "q4", {
    text: "Is a rollback plan written before every release?",
    setVersionId: "acme-v1",
    setVersionNumber: 1,
  });
  const q = questionnaireVersion({
    questionnaireId: "qq",
    questionnaireName: "Release review",
    versionId: "qq-v1",
    versionNumber: 1,
    blocks: ["risks"] as never,
    questions: [q1v1, q3v1, q4v1],
  });
  const ACCEPT = `Accept the update of ${q3v1.text.slice(0, 40)}`;

  it("T29 a reworded pick shows the notice tag, the new wording and Accept update", async () => {
    await mount({ edit: q });
    const boxes = right().querySelectorAll("div.qf-builder-update");
    expect(boxes).toHaveLength(2);
    const box = rowOf(q3v1.text).querySelector(
      "div.qf-builder-update",
    ) as HTMLElement;
    expect(box.querySelector("span.qf-tag.qf-tag--notice")?.textContent).toBe(
      "Update available",
    );
    expect(box.querySelector("p.qf-new-wording")?.textContent).toBe(
      `Acme AI policy v2 words it: ${acme3.text}`,
    );
    const accept = within(box).getByRole("button", { name: ACCEPT });
    expect(accept.textContent).toBe("Accept update");
  });

  it("T29 a pick removed from its set's latest version offers Remove from questionnaire", async () => {
    await mount({ edit: q });
    const box = rowOf(q4v1.text).querySelector(
      "div.qf-builder-update",
    ) as HTMLElement;
    expect(box.querySelector("span.qf-tag.qf-tag--notice")?.textContent).toBe(
      "Update available",
    );
    expect(box.querySelector("p.qf-new-wording")?.textContent).toBe(
      "Removed from Acme AI policy v2.",
    );
    const button = within(box)
      .getByText("Remove from questionnaire")
      .closest("button") as HTMLButtonElement;
    // the same aria pattern as Remove: the verb, then the first 40 characters of the pinned text
    expect(button.getAttribute("aria-label")).toMatch(/^Remove /);
    expect(button.getAttribute("aria-label")).toContain(q4v1.text.slice(0, 40));
  });

  it("T29 a pick whose newer set version words it the same shows no box", async () => {
    await mount({ edit: q });
    expect(rowOf(q1v1.text).querySelector("div.qf-builder-update")).toBeNull();
    expect(
      rowOf(q1v1.text).querySelector("span.qf-builder-owner")?.textContent,
    ).toBe("Acme AI policy v1");
  });

  it("T29 Accept update re-pins the row: new text, the newer set version, the box gone", async () => {
    await mount({ edit: q });
    fireEvent.click(within(right()).getByRole("button", { name: ACCEPT }));
    expect(right().textContent).toContain(acme3.text);
    expect(right().textContent).not.toContain(q3v1.text);
    const row = rowOf(acme3.text);
    expect(row.querySelector("div.qf-builder-update")).toBeNull();
    expect(row.querySelector("span.qf-builder-owner")?.textContent).toBe(
      "Acme AI policy v2",
    );
  });

  it("T29 Remove from questionnaire removes the row", async () => {
    await mount({ edit: q });
    fireEvent.click(within(right()).getByText("Remove from questionnaire"));
    expect(right().textContent).not.toContain(q4v1.text);
    expect(rowOrder()).toEqual([short(q1v1.text), short(q3v1.text)]);
  });

  it("T29 Accept all updates accepts every reworded one and leaves the removed one to decide", async () => {
    await mount({ edit: q });
    fireEvent.click(screen.getByRole("button", { name: "Accept all updates" }));
    expect(right().textContent).toContain(acme3.text);
    expect(right().querySelectorAll("div.qf-builder-update")).toHaveLength(1);
    expect(within(right()).getByText("Remove from questionnaire")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Accept all updates" }),
    ).toBeNull();
  });

  it("T29 Accept all updates is not shown when the only update is a removal, nor with no update", async () => {
    await mount({
      edit: questionnaireVersion({ ...q, questions: [q1v1, q4v1] }),
    });
    expect(
      screen.queryByRole("button", { name: "Accept all updates" }),
    ).toBeNull();
    cleanup();
    await mount({ edit: questionnaireVersion({ ...q, questions: [q1v1] }) });
    expect(
      screen.queryByRole("button", { name: "Accept all updates" }),
    ).toBeNull();
    expect(document.querySelector("div.qf-builder-update")).toBeNull();
  });

  it("T29 saving after accepting sends the pick pinned to the newer set version", async () => {
    saveQuestionnaire.mockResolvedValue(undefined);
    await mount({ edit: q });
    fireEvent.click(within(right()).getByRole("button", { name: ACCEPT }));
    fireEvent.click(screen.getByRole("button", { name: "Save as v2" }));
    await waitFor(() => expect(saveQuestionnaire).toHaveBeenCalled());
    const [project, json, id] = saveQuestionnaire.mock.calls[0];
    expect(project).toBe("mcas");
    expect(id).toBe("qq");
    expect(JSON.parse(json).items).toEqual([
      { setVersionId: "acme-v1", questionId: "acme-q1" },
      { setVersionId: "acme-v2", questionId: "acme-q3" },
      { setVersionId: "acme-v1", questionId: "acme-q4" },
    ]);
  });

  it("T29 saving without accepting keeps every pin", async () => {
    saveQuestionnaire.mockResolvedValue(undefined);
    await mount({ edit: q });
    fireEvent.click(screen.getByRole("button", { name: "Save as v2" }));
    await waitFor(() => expect(saveQuestionnaire).toHaveBeenCalled());
    expect(
      JSON.parse(saveQuestionnaire.mock.calls[0][1]).items.map(
        (i: { setVersionId: string }) => i.setVersionId,
      ),
    ).toEqual(["acme-v1", "acme-v1", "acme-v1"]);
  });

  it("T29 a retired set's newer version still counts for updates, though it has no chip", async () => {
    const oldV2 = {
      ...oldGroup,
      versionId: "old-v2",
      versionNumber: 2,
      questions: [
        {
          ...old1,
          text: "Reworded?",
          setVersionId: "old-v2",
          setVersionNumber: 2,
        },
      ],
    };
    await mount({ edit: questionnaireVersion({ ...q, questions: [old1] }) }, [
      annexGroup,
      acmeGroup,
      oldV2,
      zetaGroup,
    ]);
    expect(
      within(setsBox()).queryByRole("checkbox", { name: /^Old set/ }),
    ).toBeNull();
    expect(right().querySelector("p.qf-new-wording")?.textContent).toBe(
      "Old set v2 words it: Reworded?",
    );
  });
});

// Save and use once

describe("saving and using once (T30)", () => {
  it('T30 a new questionnaire\'s footer has "Use once" (ghost) and "Save questionnaire"', async () => {
    await mount();
    const once = screen.getByRole("button", { name: "Use once" });
    expect(once.classList.contains("ghost")).toBe(true);
    expect(
      screen.getByRole("button", { name: "Save questionnaire" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Save as v/ })).toBeNull();
  });

  it('T30 an existing questionnaire saves "as v<N+1>"', async () => {
    await mount({
      edit: questionnaireVersion({
        questionnaireId: "qa",
        versionId: "qa-v3",
        versionNumber: 3,
      }),
    });
    expect(screen.getByRole("button", { name: "Save as v4" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Save questionnaire" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Use once" })).toBeTruthy();
  });

  it("T30 T33 Save questionnaire sends only the name, description, blocks and pinned items", async () => {
    saveQuestionnaire.mockResolvedValue(undefined);
    await browse();
    fireEvent.change(screen.getByLabelText("Questionnaire name"), {
      target: { value: "Release review" },
    });
    fireEvent.click(within(right()).getByRole("checkbox", { name: "Risks" }));
    tick("Who signs off a model release?");
    tick(annex2a.text.slice(0, 30));
    fireEvent.click(screen.getByRole("button", { name: "Save questionnaire" }));
    await waitFor(() => expect(saveQuestionnaire).toHaveBeenCalled());
    const [project, json, id, origin] = saveQuestionnaire.mock.calls[0];
    expect(project).toBe("mcas");
    expect(id ?? undefined).toBeUndefined();
    expect(origin).toBe("builder");
    expect(JSON.parse(json)).toEqual({
      name: "Release review",
      description: "",
      blocks: ALL_BLOCKS.filter((b) => b !== "risks"),
      items: [
        { setVersionId: "acme-v2", questionId: "acme-q1" },
        { setVersionId: "annex-iv-v1", questionId: "annex-iv-2a" },
      ],
    });
  });

  it("T30 the save's error shows in div.error above the footer", async () => {
    saveQuestionnaire.mockResolvedValue({
      error: "Give the questionnaire a name.",
    });
    const { container } = await mount();
    fireEvent.click(screen.getByRole("button", { name: "Save questionnaire" }));
    await waitFor(() =>
      expect(container.querySelector("div.error")?.textContent).toBe(
        "Give the questionnaire a name.",
      ),
    );
  });

  it("T30 Use once sends the draft to useQuestionnaireOnce with the origin", async () => {
    useQuestionnaireOnce.mockResolvedValue(undefined);
    await browse();
    tick("How are incidents reported?");
    fireEvent.click(screen.getByRole("button", { name: "Use once" }));
    await waitFor(() => expect(useQuestionnaireOnce).toHaveBeenCalled());
    const [project, json, origin] = useQuestionnaireOnce.mock.calls[0];
    expect(project).toBe("mcas");
    expect(origin).toBe("builder");
    expect(JSON.parse(json).items).toEqual([
      { setVersionId: "acme-v2", questionId: "acme-q2" },
    ]);
    expect(saveQuestionnaire).not.toHaveBeenCalled();
  });
});

// Where the builder opens

describe("where the builder opens (T31)", () => {
  // Q's latest version pins acme q3 to acme-v1 (older than the library's acme-v2) and Annex IV 1a.
  const q3v1 = { ...acme3, setVersionId: "acme-v1", setVersionNumber: 1 };
  const q = questionnaireVersion({
    questionnaireId: "qq",
    questionnaireName: "Release review",
    versionId: "qq-v2",
    versionNumber: 2,
    blocks: ["description", "risks"] as never,
    questions: [annex1a, q3v1],
  });

  it("T31 a new questionnaire opens with nothing selected and all 9 blocks ticked", async () => {
    await mount({});
    for (const b of within(setsBox()).getAllByRole("checkbox"))
      expect((b as HTMLInputElement).checked).toBe(false);
    expect(rowOrder()).toEqual([]);
    expect(
      (
        within(right()).getByRole("checkbox", {
          name: "Risks",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });

  it("T31 ?from=<Q>: Q's items pinned to the same set versions, its sets selected in first appearance order, its blocks", async () => {
    saveQuestionnaire.mockResolvedValue(undefined);
    await mount({ startFrom: q });
    expect(setBox("Annex IV").checked).toBe(true);
    expect(setBox("Acme AI policy").checked).toBe(true);
    expect(setBox("Zeta").checked).toBe(false);
    expect(groupHeadings()).toEqual(["Annex IV", "Acme AI policy"]);
    expect(rowOrder()).toEqual([short(annex1a.text), short(q3v1.text)]);
    expect(
      rowOf(q3v1.text).querySelector("span.qf-builder-owner")?.textContent,
    ).toBe("Acme AI policy v1");
    expect(
      (
        within(right()).getByRole("checkbox", {
          name: "Risks",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(
      (
        within(right()).getByRole("checkbox", {
          name: METADATA_FIELDS.targetUsers.label,
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);
    // a new questionnaire: a name input, never re-pinned
    fireEvent.change(screen.getByLabelText("Questionnaire name"), {
      target: { value: "Copy" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save questionnaire" }));
    await waitFor(() => expect(saveQuestionnaire).toHaveBeenCalled());
    expect(JSON.parse(saveQuestionnaire.mock.calls[0][1]).items).toEqual([
      { setVersionId: "annex-iv-v1", questionId: "annex-iv-1a" },
      { setVersionId: "acme-v1", questionId: "acme-q3" },
    ]);
  });

  it("T31 editing Q: the same rows, selection and blocks, the name read-only", async () => {
    await mount({ edit: q });
    expect(setBox("Annex IV").checked).toBe(true);
    expect(setBox("Acme AI policy").checked).toBe(true);
    expect(rowOrder()).toEqual([short(annex1a.text), short(q3v1.text)]);
    expect(screen.queryByLabelText("Questionnaire name")).toBeNull();
    expect(
      within(right()).getByRole("heading", {
        level: 2,
        name: "Release review",
      }),
    ).toBeTruthy();
    // the library ticks exactly the picked questions
    expect(questionBoxes().map((b) => b.checked)).toEqual([
      true,
      false,
      false,
      false,
      true,
    ]);
  });

  it("T31 an import by reference opens with its picks, their sets selected, the file's blocks and name, origin import", async () => {
    saveQuestionnaire.mockResolvedValue(undefined);
    await mount({
      name: "Imported review",
      description: "From elsewhere.",
      blocks: ["risks"],
      origin: "import",
      picks: [
        { question: acme1, setVersionId: "acme-v2" },
        { question: annex2a, setVersionId: "annex-iv-v1" },
      ],
    });
    expect(setBox("Acme AI policy").checked).toBe(true);
    expect(setBox("Annex IV").checked).toBe(true);
    expect(groupHeadings()).toEqual(["Acme AI policy", "Annex IV"]);
    expect(
      (screen.getByLabelText("Questionnaire name") as HTMLInputElement).value,
    ).toBe("Imported review");
    fireEvent.click(screen.getByRole("button", { name: "Save questionnaire" }));
    await waitFor(() => expect(saveQuestionnaire).toHaveBeenCalled());
    const [, json, id, origin] = saveQuestionnaire.mock.calls[0];
    expect(id ?? undefined).toBeUndefined();
    expect(origin).toBe("import");
    expect(JSON.parse(json)).toEqual({
      name: "Imported review",
      description: "From elsewhere.",
      blocks: ["risks"],
      items: [
        { setVersionId: "acme-v2", questionId: "acme-q1" },
        { setVersionId: "annex-iv-v1", questionId: "annex-iv-2a" },
      ],
    });
  });
});

// The builder's markup

describe("the builder's root (T32)", () => {
  it("T32 the root is div.qualify-form.qf-builder with the two sections as its only children", async () => {
    const { container } = await mount();
    const root = container.querySelector(
      "div.qualify-form.qf-builder",
    ) as HTMLElement;
    expect(root).toBeTruthy();
    expect([...root.children].map((c) => c.tagName)).toEqual([
      "SECTION",
      "SECTION",
    ]);
    expect([...root.children].map((c) => c.getAttribute("aria-label"))).toEqual(
      ["Question library", "Your questionnaire"],
    );
  });
});
