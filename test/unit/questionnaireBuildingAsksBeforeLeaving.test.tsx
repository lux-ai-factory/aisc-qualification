// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { loadSrc, seededQuestion, setQuestion } from "../support/forms";

// A questionnaire or a question set being built lives only in the page. Leaving it
// with changes (an in-app link such as "Write a question set", or closing the tab)
// asks first, as the card form does. An untouched builder asks nothing.

vi.mock("@/app/p/[project]/questionnaires/actions", () => ({
  saveQuestionnaire: vi.fn(),
  useQuestionnaireOnce: vi.fn(),
  retireQuestionnaire: vi.fn(),
}));
vi.mock("@/app/p/[project]/question-sets/actions", () => ({
  saveQuestionSet: vi.fn(),
  retireQuestionSet: vi.fn(),
}));
vi.mock("@/lib/projectDb", () => ({
  projectDbPastDoor: async () => ({}),
  projectDbForAction: async () => ({ db: {} }),
  projectDbForRoute: async () => ({}),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined }),
}));

const acme1 = setQuestion("acme", "q1", {
  text: "Who signs off a model release?",
  citation: "Acme AI Policy",
  setVersionId: "acme-v2",
  setVersionNumber: 2,
});
const groups = [
  {
    setId: "annex-iv",
    setName: "Annex IV",
    versionId: "annex-iv-v1",
    versionNumber: 1,
    retired: false,
    questions: [seededQuestion("1a")],
  },
  {
    setId: "acme",
    setName: "Acme AI policy",
    versionId: "acme-v2",
    versionNumber: 2,
    retired: false,
    questions: [acme1],
  },
];

let confirm: ReturnType<typeof vi.fn>;
beforeEach(() => {
  confirm = vi.fn(() => false);
  window.confirm = confirm as never;
});
afterEach(cleanup);

async function builder() {
  const { default: QuestionnaireBuilder } = await loadSrc(
    "app/p/[project]/questionnaires/QuestionnaireBuilder.tsx",
  );
  return render(
    <QuestionnaireBuilder project="mcas" groups={groups} initial={{}} />,
  );
}

function pickASet() {
  fireEvent.click(
    screen.getByRole("checkbox", { name: /^Acme AI policy/ }),
  );
}

function clickWriteASet(): boolean {
  const link = screen.getByRole("link", { name: /Write a question set/ });
  const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
  link.dispatchEvent(click);
  return click.defaultPrevented;
}

function unload(): boolean {
  const e = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
}

describe("leaving a questionnaire being built", () => {
  it("'Write a question set' asks before it drops the questionnaire being built", async () => {
    await builder();
    pickASet();
    const stopped = clickWriteASet();
    expect(confirm, "no question before leaving the builder").toHaveBeenCalled();
    expect(stopped, "the link was followed after the person said no").toBe(true);
  });

  it("closing the tab with a questionnaire being built gets the browser's warning", async () => {
    await builder();
    pickASet();
    expect(unload(), "no leave warning on a changed builder").toBe(true);
  });

  it("an untouched builder lets the person leave without asking", async () => {
    await builder();
    clickWriteASet();
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe("leaving a question set being written", () => {
  it("closing the tab with a new question in the editor gets the browser's warning", async () => {
    const { default: NewQuestionSetPage } = await loadSrc(
      "app/p/[project]/question-sets/new/page.tsx",
    );
    const tree = await NewQuestionSetPage({
      params: Promise.resolve({ project: "mcas" }),
      searchParams: Promise.resolve({}),
    } as never);
    const { container } = render(tree);
    fireEvent.click(screen.getByRole("button", { name: "+ New question" }));
    fireEvent.change(container.querySelector(".qf-builder-editor textarea")!, {
      target: { value: "Who reviews the training data?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save question" }));
    expect(unload(), "no leave warning on a changed question set").toBe(true);
  });
});
