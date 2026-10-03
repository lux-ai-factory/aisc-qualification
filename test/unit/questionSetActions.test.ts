import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { decide } from "@/server/access/projectAccess";
import { loadSrc, setVersion, annexSetLiteral } from "../support/forms";

// Two-level forms (docs/superpowers/two-level-forms-2026-09-25/01-spec.md): the question-set
// server actions (T18), who saved (T55), and the edit page's refusals (T15). The service and the
// caller's name are stood in for; parseSetDraft (src/domain/forms/questionSetDraft.ts) is real.
// Carried from formActions.test.ts (deleted, spec 8.2): R42 door tests, R48 redirects inside
// /p/<project>/, R47 the service is never given the project.
//
//   saveQuestionSet(project, draftJson, setId?, opts?: {origin?, alsoQuestionnaire?})
//   retireQuestionSet(project, setId)
// Each returns { error } when it refuses, and redirects when it succeeds.

const { questionSetService, callerName, redirect, notFound } = vi.hoisted(() => ({
  questionSetService: {
    saveDraft: vi.fn(),
    retire: vi.fn(),
    latest: vi.fn(),
    atNumber: vi.fn(),
    resolveSetVersion: vi.fn(),
    history: vi.fn(async () => []),
    groups: vi.fn(async () => []),
    list: vi.fn(async () => []),
  },
  callerName: vi.fn(),
  notFound: vi.fn(() => {
    throw Object.assign(new Error("NEXT_NOT_FOUND"), { notFound: true });
  }),
  // next/navigation's redirect throws to stop the action; so does this one
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT ${url}`), { url });
  }),
}));

vi.mock("next/navigation", () => ({
  redirect,
  notFound,
  permanentRedirect: redirect,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
// The project doors let these calls through: which project's database a forms page, action or
// route opens, and who may, is pinned by isolationForms.test.ts.
vi.mock("@/lib/projectDb", () => ({
  projectDbPastDoor: async () => ({}),
  projectDbForAction: async () => ({ db: {} }),
  projectDbForRoute: async () => ({}),
}));
vi.mock("@/server/services/QuestionSetService", () => ({ QuestionSetService: class {}, questionSetService, questionSetsOn: () => questionSetService }));
vi.mock("@/server/access/callerName", () => ({ callerName, identityFromToken: vi.fn() }));

const DIR = "src/app/p/[project]/question-sets";
const ACTIONS = `${DIR}/actions.ts`;
const IMPORT_ACTIONS = `${DIR}/import/actions.ts`;
const actions = () => loadSrc("app/p/[project]/question-sets/actions.ts");

const goodDraft = {
  name: "Acme AI policy",
  description: "Our release policy.",
  questions: [
    { text: "Who signs off a model release?", citation: "Acme AI Policy §4.2", required: true, annexPoint: null },
    { text: "Which data trains it?", citation: "", required: false, annexPoint: "2d" },
  ],
};

/** Run an action that may redirect; the URL it went to, or its return value. */
async function run<T>(p: Promise<T>): Promise<{ redirected: string | null; value: T | undefined }> {
  try {
    return { redirected: null, value: await p };
  } catch (err) {
    const url = (err as { url?: string }).url;
    if (url) return { redirected: url, value: undefined };
    throw err;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  callerName.mockResolvedValue("alice");
});

describe("saveQuestionSet (T18, T55)", () => {
  it("T18 JSON that does not parse is refused with The question set could not be read.", async () => {
    const { saveQuestionSet } = await actions();
    expect(await saveQuestionSet("mcas", "{not json")).toEqual({ error: "The question set could not be read." });
    expect(questionSetService.saveDraft).not.toHaveBeenCalled();
  });

  it("T18 an invalid draft is refused with parseSetDraft's message and nothing is saved", async () => {
    const { saveQuestionSet } = await actions();
    expect(await saveQuestionSet("mcas", JSON.stringify({ ...goodDraft, name: "   " }))).toEqual({
      error: "Give the question set a name.",
    });
    expect(await saveQuestionSet("mcas", JSON.stringify({ ...goodDraft, questions: [] }))).toEqual({
      error: "A question set needs at least one question.",
    });
    expect(questionSetService.saveDraft).not.toHaveBeenCalled();
  });

  it("T18 T55 a new set is saved from the builder by the caller, and opens the set's page on the new version", async () => {
    questionSetService.saveDraft.mockResolvedValue({ ok: true, setId: "s1", versionId: "s1-v", number: 1, created: true });
    const { saveQuestionSet } = await actions();
    const { redirected } = await run(saveQuestionSet("mcas", JSON.stringify(goodDraft)));
    expect(redirected).toBe("/p/mcas/question-sets/s1?version=1");
    expect(callerName).toHaveBeenCalled();
    const [draft, opts] = questionSetService.saveDraft.mock.calls[0];
    expect(draft).toMatchObject({ name: "Acme AI policy", questions: [{ text: "Who signs off a model release?" }, {}] });
    expect(opts.setId).toBeUndefined();
    expect(opts.origin ?? "builder").toBe("builder");
    expect(opts.createdBy).toBe("alice");
    expect(opts.alsoQuestionnaire ?? false).toBe(false);
  });

  it("T18 saving an existing set passes its id, so its next version is made", async () => {
    questionSetService.saveDraft.mockResolvedValue({ ok: true, setId: "acme", versionId: "acme-v4", number: 4, created: true });
    const { saveQuestionSet } = await actions();
    const { redirected } = await run(saveQuestionSet("mcas", JSON.stringify(goodDraft), "acme"));
    expect(questionSetService.saveDraft.mock.calls[0][1]).toMatchObject({ setId: "acme", createdBy: "alice" });
    expect(redirected).toBe("/p/mcas/question-sets/acme?version=4");
  });

  it("T18 a save that made no version (created false) redirects with &unchanged=1", async () => {
    questionSetService.saveDraft.mockResolvedValue({ ok: true, setId: "acme", versionId: "acme-v2", number: 2, created: false });
    const { saveQuestionSet } = await actions();
    const { redirected } = await run(saveQuestionSet("mcas", JSON.stringify(goodDraft), "acme"));
    expect(redirected).toBe("/p/mcas/question-sets/acme?version=2&unchanged=1");
  });

  it("T18 T49 the import's origin and 'Also make a questionnaire' travel to the service", async () => {
    questionSetService.saveDraft.mockResolvedValue({
      ok: true, setId: "s9", versionId: "s9-v1", number: 1, created: true, questionnaireId: "q9",
    });
    const { saveQuestionSet } = await actions();
    await run(saveQuestionSet("mcas", JSON.stringify(goodDraft), undefined, { origin: "import", alsoQuestionnaire: true }));
    expect(questionSetService.saveDraft.mock.calls[0][1]).toMatchObject({
      origin: "import",
      alsoQuestionnaire: true,
      createdBy: "alice",
    });
  });

  it("T55 with no name in the token the caller is unknown, and that is what is stored", async () => {
    callerName.mockResolvedValue("unknown");
    questionSetService.saveDraft.mockResolvedValue({ ok: true, setId: "s1", versionId: "v", number: 1, created: true });
    const { saveQuestionSet } = await actions();
    await run(saveQuestionSet("mcas", JSON.stringify(goodDraft)));
    expect(questionSetService.saveDraft.mock.calls[0][1].createdBy).toBe("unknown");
  });

  it("T18 the service's refusal reaches the person, e.g. a save that lost a race", async () => {
    const error = "This question set was saved by someone else meanwhile. Reload it and save again.";
    questionSetService.saveDraft.mockResolvedValue({ ok: false, error });
    const { saveQuestionSet } = await actions();
    expect(await saveQuestionSet("mcas", JSON.stringify(goodDraft), "acme")).toEqual({ error });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("T18 R48 called with project b it redirects inside /p/b/", async () => {
    questionSetService.saveDraft.mockResolvedValue({ ok: true, setId: "s1", versionId: "v", number: 1, created: true });
    const { saveQuestionSet } = await actions();
    expect((await run(saveQuestionSet("b", JSON.stringify(goodDraft)))).redirected).toBe("/p/b/question-sets/s1?version=1");
  });

  it("T18 T63 R47 the service is never told the project: saveDraft gets the draft and the options, nothing names a project", async () => {
    questionSetService.saveDraft.mockResolvedValue({ ok: true, setId: "s1", versionId: "v", number: 1, created: true });
    const { saveQuestionSet } = await actions();
    await run(saveQuestionSet("a", JSON.stringify(goodDraft)));
    const call = questionSetService.saveDraft.mock.calls[0];
    expect(call).toHaveLength(2);
    expect(Object.keys(call[1]).filter((k) => /project/i.test(k))).toEqual([]);
    expect(JSON.stringify(call)).not.toContain('"a"');
  });
});

describe("retireQuestionSet (T18, T19)", () => {
  it("T18 success retires the set and redirects to the question sets page", async () => {
    questionSetService.retire.mockResolvedValue({ ok: true });
    const { retireQuestionSet } = await actions();
    const { redirected } = await run(retireQuestionSet("mcas", "acme"));
    expect(questionSetService.retire).toHaveBeenCalledWith("acme", expect.any(Function));   // + its ledger event
    expect(questionSetService.retire.mock.calls[0]).toHaveLength(2);           // the id, and its ledger recorder
    expect(redirected).toBe("/p/mcas/question-sets");
  });

  it("T18 the builtin set: Annex IV cannot be retired.", async () => {
    questionSetService.retire.mockResolvedValue({ ok: false, error: "Annex IV cannot be retired." });
    const { retireQuestionSet } = await actions();
    expect(await retireQuestionSet("mcas", "annex-iv")).toEqual({ error: "Annex IV cannot be retired." });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("T18 unknown or already retired: That question set cannot be retired.", async () => {
    questionSetService.retire.mockResolvedValue({ ok: false, error: "That question set cannot be retired." });
    const { retireQuestionSet } = await actions();
    expect(await retireQuestionSet("mcas", "nope")).toEqual({ error: "That question set cannot be retired." });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("the question-set files are server actions behind the project door (T18, R42)", () => {
  it('T18 both action files start with "use server"', () => {
    for (const file of [ACTIONS, IMPORT_ACTIONS]) {
      expect(existsSync(file), file).toBe(true);
      expect(readFileSync(file, "utf8")).toMatch(/^\s*["']use server["'];/);
    }
  });

  it("T18 the actions file exports exactly saveQuestionSet and retireQuestionSet", async () => {
    const mod = await actions();
    expect(Object.keys(mod).sort()).toEqual(["retireQuestionSet", "saveQuestionSet"]);
  });

  it("T49 the import actions file exports readQuestionSetFile (was readFormFile, same body)", () => {
    const src = readFileSync(IMPORT_ACTIONS, "utf8");
    expect(src).toMatch(/export\s+async\s+function\s+readQuestionSetFile\s*\(/);
    expect(src).not.toMatch(/readFormFile/);
  });

  it("R42 every question-set page and action lives under /p/[project]/, where the middleware applies", () => {
    for (const file of [
      ACTIONS,
      IMPORT_ACTIONS,
      `${DIR}/page.tsx`,
      `${DIR}/new/page.tsx`,
      `${DIR}/[setId]/page.tsx`,
      `${DIR}/[setId]/edit/page.tsx`,
      `${DIR}/[setId]/export/route.ts`,
      `${DIR}/import/page.tsx`,
      `${DIR}/import/QuestionSetImport.tsx`,
      `${DIR}/QuestionSetEditor.tsx`,
      "src/app/p/[project]/RetireButton.tsx",
    ]) {
      expect(existsSync(file), file).toBe(true);
    }
  });

  it("R42 no question-set action reads the caller's admin flag", () => {
    for (const file of [ACTIONS, IMPORT_ACTIONS]) expect(readFileSync(file, "utf8")).not.toMatch(/\.admin\b/);
  });

  it("R42 D9 a viewer may open the pages but not save or retire (the door already says so)", () => {
    const viewer = { role: "viewer", admin: false, may_write: false };
    expect(decide("GET", viewer)).toBe("allow");
    expect(decide("POST", viewer)).toBe("forbidden");
  });
});

describe("editing a question set that may not be edited (T15)", () => {
  const open = async (setId: string) => {
    const { default: EditSetPage } = await loadSrc("app/p/[project]/question-sets/[setId]/edit/page.tsx");
    try {
      await EditSetPage({ params: Promise.resolve({ project: "mcas", setId }), searchParams: Promise.resolve({}) });
      return "rendered";
    } catch (err) {
      if ((err as { notFound?: boolean }).notFound) return "404";
      throw err;
    }
  };

  it("T15 /question-sets/annex-iv/edit answers 404: the builtin set is read-only", async () => {
    questionSetService.latest.mockResolvedValue(annexSetLiteral());
    expect(await open("annex-iv")).toBe("404");
  });

  it("T15 a retired set answers 404", async () => {
    questionSetService.latest.mockResolvedValue(setVersion({ retired: true }));
    expect(await open("acme")).toBe("404");
  });

  it("T15 an unknown set answers 404", async () => {
    questionSetService.latest.mockResolvedValue(null);
    expect(await open("nope")).toBe("404");
  });

  it("T15 an editable set renders the editor (not a 404)", async () => {
    questionSetService.latest.mockResolvedValue(setVersion({ versionNumber: 2, versionId: "acme-v2" }));
    expect(await open("acme")).toBe("rendered");
  });
});
