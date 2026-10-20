import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import {
  loadSrc,
  formVersion,
  defaultVersionLiteral,
  setQuestion,
} from "../support/forms";

// The questionnaire server actions, where the builder opens and what it refuses (the 404
// cases), who saved, and the import actions. Services, the platform, the file client and the
// caller's name are stood in for; parseQuestionnaireDraft is real. Also: the project door,
// redirects, use-once naming, the exact export list with no admin flag, and the service is
// never given the project.
//
//   saveQuestionnaire(project, draftJson, questionnaireId?, origin?)
//   useQuestionnaireOnce(project, draftJson, origin?)
//   retireQuestionnaire(project, id)
//   import/actions.ts: readQuestionnaireFile(project, formData), importSelfContained(project, fileJson, setName, questionnaireName)

const {
  questionnaireService,
  questionSetService,
  questionnaireFileClient,
  callerName,
  redirect,
  notFound,
  platformClient,
} = vi.hoisted(() => ({
  questionnaireService: {
    saveDraft: vi.fn(),
    retire: vi.fn(),
    latestVersion: vi.fn(),
    resolve: vi.fn(),
    history: vi.fn(async () => []),
    library: vi.fn(async () => []),
    chooserOptions: vi.fn(async () => []),
    resolveReferences: vi.fn(),
    importSelfContained: vi.fn(),
  },
  questionSetService: {
    groups: vi.fn(async () => []),
    list: vi.fn(async () => []),
  },
  questionnaireFileClient: { read: vi.fn(), write: vi.fn() },
  platformClient: { latestVersion: vi.fn() },
  callerName: vi.fn(),
  notFound: vi.fn(() => {
    throw Object.assign(new Error("NEXT_NOT_FOUND"), { notFound: true });
  }),
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
vi.mock("@/server/services/QuestionnaireFileClient", () => ({
  QuestionnaireFileClient: class {},
  questionnaireFileClient,
}));
vi.mock("@/server/services/PlatformClient", () => ({
  PlatformClient: class {},
  platformClient,
}));
vi.mock("@/server/access/callerName", () => ({
  callerName,
  identityFromToken: vi.fn(),
}));

const DIR = "src/app/p/[project]/questionnaires";
const ACTIONS = `${DIR}/actions.ts`;
const IMPORT_ACTIONS = `${DIR}/import/actions.ts`;
const actions = () => loadSrc("app/p/[project]/questionnaires/actions.ts");
const importActions = () =>
  loadSrc("app/p/[project]/questionnaires/import/actions.ts");

const goodDraft = {
  name: "Acme mix",
  description: "",
  blocks: ["risks"],
  items: [
    { setVersionId: "annex-iv-v1", questionId: "annex-iv-2a" },
    { setVersionId: "acme-v1", questionId: "acme-q1" },
  ],
};

async function run<T>(
  p: Promise<T>,
): Promise<{ redirected: string | null; value: T | undefined }> {
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
  platformClient.latestVersion.mockResolvedValue({
    pid: "p1",
    project_id: "mcas",
    number: 2,
    name: "MCAS",
    version: "1.2.0",
    provider: null,
    description: null,
    created_at: "2026-09-25T08:00:00Z",
    created_by: null,
  });
});

describe("saveQuestionnaire", () => {
  it("a valid new questionnaire is saved listed, from the builder, by the caller, and opens the card form on it", async () => {
    questionnaireService.saveDraft.mockResolvedValue({
      ok: true,
      questionnaireId: "clx9abc",
      versionId: "v1",
      number: 1,
      created: true,
    });
    const { saveQuestionnaire } = await actions();
    const { redirected } = await run(
      saveQuestionnaire("mcas", JSON.stringify(goodDraft)),
    );
    expect(redirected).toBe("/p/mcas/system/edit?questionnaire=clx9abc");
    const [draft, opts] = questionnaireService.saveDraft.mock.calls[0];
    expect(draft).toMatchObject({
      name: "Acme mix",
      blocks: ["risks"],
      items: goodDraft.items,
    });
    expect(opts).toMatchObject({ listed: true, createdBy: "alice" });
    expect(opts.questionnaireId).toBeUndefined();
    expect(opts.origin ?? "builder").toBe("builder");
    expect(callerName).toHaveBeenCalled();
  });

  it("a questionnaire opened from the import page is saved with origin import", async () => {
    questionnaireService.saveDraft.mockResolvedValue({
      ok: true,
      questionnaireId: "q2",
      versionId: "v1",
      number: 1,
      created: true,
    });
    const { saveQuestionnaire } = await actions();
    await run(
      saveQuestionnaire("mcas", JSON.stringify(goodDraft), undefined, "import"),
    );
    expect(questionnaireService.saveDraft.mock.calls[0][1]).toMatchObject({
      listed: true,
      origin: "import",
    });
  });

  it("saving an existing questionnaire passes its id, so the next version is made", async () => {
    questionnaireService.saveDraft.mockResolvedValue({
      ok: true,
      questionnaireId: "mix",
      versionId: "mix-v4",
      number: 4,
      created: true,
    });
    const { saveQuestionnaire } = await actions();
    const { redirected } = await run(
      saveQuestionnaire("mcas", JSON.stringify(goodDraft), "mix", undefined, 3),
    );
    expect(questionnaireService.saveDraft.mock.calls[0][1]).toMatchObject({
      questionnaireId: "mix",
      listed: true,
    });
    expect(redirected).toBe("/p/mcas/system/edit?questionnaire=mix");
  });

  it("saving an existing questionnaire passes the version the builder was opened on (baseNumber)", async () => {
    questionnaireService.saveDraft.mockResolvedValue({
      ok: true,
      questionnaireId: "mix",
      versionId: "mix-v3",
      number: 3,
      created: true,
    });
    const { saveQuestionnaire } = await actions();
    await run(
      saveQuestionnaire("mcas", JSON.stringify(goodDraft), "mix", "builder", 2),
    );
    expect(questionnaireService.saveDraft.mock.calls[0][1]).toMatchObject({
      questionnaireId: "mix",
      baseNumber: 2,
    });
  });

  it("an existing questionnaire saved without a valid baseNumber is refused (reload) and nothing is saved", async () => {
    const { saveQuestionnaire } = await actions();
    for (const base of [undefined, 0, 1.5, "2"]) {
      const r = await saveQuestionnaire(
        "mcas",
        JSON.stringify(goodDraft),
        "mix",
        undefined,
        base as never,
      );
      expect(r, String(base)).toEqual({
        error:
          "This questionnaire was saved by someone else meanwhile. Reload it and save again.",
      });
    }
    expect(questionnaireService.saveDraft).not.toHaveBeenCalled();
  });

  it("JSON that does not parse is refused with The questionnaire could not be read.", async () => {
    const { saveQuestionnaire } = await actions();
    expect(await saveQuestionnaire("mcas", "{not json")).toEqual({
      error: "The questionnaire could not be read.",
    });
    expect(questionnaireService.saveDraft).not.toHaveBeenCalled();
  });

  it("an invalid draft is refused with parseQuestionnaireDraft's message and nothing is saved", async () => {
    const { saveQuestionnaire } = await actions();
    expect(
      await saveQuestionnaire(
        "mcas",
        JSON.stringify({ ...goodDraft, name: "   " }),
      ),
    ).toEqual({
      error: "Give the questionnaire a name.",
    });
    expect(
      await saveQuestionnaire(
        "mcas",
        JSON.stringify({ ...goodDraft, blocks: ["colour"] }),
      ),
    ).toEqual({
      error: "colour is not a part of the questionnaire.",
    });
    expect(questionnaireService.saveDraft).not.toHaveBeenCalled();
  });

  it("the service's refusal reaches the person, e.g. a save that lost a race", async () => {
    const error =
      "This questionnaire was saved by someone else meanwhile. Reload it and save again.";
    questionnaireService.saveDraft.mockResolvedValue({ ok: false, error });
    const { saveQuestionnaire } = await actions();
    expect(
      await saveQuestionnaire("mcas", JSON.stringify(goodDraft), "mix", undefined, 2),
    ).toEqual({ error });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("useQuestionnaireOnce", () => {
  beforeEach(() => {
    questionnaireService.saveDraft.mockResolvedValue({
      ok: true,
      questionnaireId: "u1",
      versionId: "u1-v1",
      number: 1,
      created: true,
    });
  });

  it("saves an unlisted questionnaire named after the system (the latest card's name) and opens that version", async () => {
    const { useQuestionnaireOnce } = await actions();
    const { redirected } = await run(
      useQuestionnaireOnce("mcas", JSON.stringify({ ...goodDraft, name: "" })),
    );
    expect(platformClient.latestVersion).toHaveBeenCalledWith("mcas");
    const [, opts] = questionnaireService.saveDraft.mock.calls[0];
    expect(opts).toMatchObject({
      listed: false,
      systemName: "MCAS",
      createdBy: "alice",
    });
    expect(redirected).toBe("/p/mcas/system/edit?questionnaireVersion=u1-v1");
  });

  it("a project with no card yet: the project argument is the system name", async () => {
    platformClient.latestVersion.mockResolvedValue(null);
    const { useQuestionnaireOnce } = await actions();
    await run(useQuestionnaireOnce("mcas", JSON.stringify(goodDraft)));
    expect(questionnaireService.saveDraft.mock.calls[0][1]).toMatchObject({
      listed: false,
      systemName: "mcas",
    });
  });

  it("the platform failing falls back to the project argument, and still saves", async () => {
    platformClient.latestVersion.mockRejectedValue(
      new Error("Could not name this system: the platform did not answer."),
    );
    const { useQuestionnaireOnce } = await actions();
    const { redirected } = await run(
      useQuestionnaireOnce("mcas", JSON.stringify(goodDraft)),
    );
    expect(questionnaireService.saveDraft.mock.calls[0][1]).toMatchObject({
      listed: false,
      systemName: "mcas",
    });
    expect(redirected).toBe("/p/mcas/system/edit?questionnaireVersion=u1-v1");
  });

  it("the origin travels", async () => {
    const { useQuestionnaireOnce } = await actions();
    await run(
      useQuestionnaireOnce("mcas", JSON.stringify(goodDraft), "import"),
    );
    expect(questionnaireService.saveDraft.mock.calls[0][1]).toMatchObject({
      listed: false,
      origin: "import",
    });
  });

  it("still validates the items", async () => {
    const { useQuestionnaireOnce } = await actions();
    const bad = {
      ...goodDraft,
      items: [goodDraft.items[0], goodDraft.items[0]],
    };
    expect(await useQuestionnaireOnce("mcas", JSON.stringify(bad))).toEqual({
      error: "Question 2 is already in the questionnaire.",
    });
    expect(questionnaireService.saveDraft).not.toHaveBeenCalled();
  });
});

describe("retireQuestionnaire", () => {
  it("success retires it and redirects to the questionnaires page", async () => {
    questionnaireService.retire.mockResolvedValue({ ok: true });
    const { retireQuestionnaire } = await actions();
    const { redirected } = await run(retireQuestionnaire("mcas", "mix"));
    expect(questionnaireService.retire).toHaveBeenCalledWith(
      "mix",
      expect.any(Function),
    ); // + its ledger event
    expect(questionnaireService.retire.mock.calls[0]).toHaveLength(2); // the id, and its ledger recorder
    expect(redirected).toBe("/p/mcas/questionnaires");
  });

  it("the builtin: The Annex IV default cannot be archived.", async () => {
    questionnaireService.retire.mockResolvedValue({
      ok: false,
      error: "The Annex IV default cannot be archived.",
    });
    const { retireQuestionnaire } = await actions();
    expect(await retireQuestionnaire("mcas", "annex-iv-default")).toEqual({
      error: "The Annex IV default cannot be archived.",
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("unknown, unlisted or already retired: That questionnaire cannot be archived.", async () => {
    questionnaireService.retire.mockResolvedValue({
      ok: false,
      error: "That questionnaire cannot be archived.",
    });
    const { retireQuestionnaire } = await actions();
    expect(await retireQuestionnaire("mcas", "u1")).toEqual({
      error: "That questionnaire cannot be archived.",
    });
  });
});

describe("the project is navigation context only", () => {
  it("saveQuestionnaire and useQuestionnaireOnce called with project b redirect inside /p/b/", async () => {
    questionnaireService.saveDraft.mockResolvedValue({
      ok: true,
      questionnaireId: "clx9abc",
      versionId: "clx9abc-v1",
      number: 1,
      created: true,
    });
    const { saveQuestionnaire, useQuestionnaireOnce } = await actions();
    expect(
      (await run(saveQuestionnaire("b", JSON.stringify(goodDraft)))).redirected,
    ).toBe("/p/b/system/edit?questionnaire=clx9abc");
    expect(
      (await run(useQuestionnaireOnce("b", JSON.stringify(goodDraft))))
        .redirected,
    ).toBe("/p/b/system/edit?questionnaireVersion=clx9abc-v1");
  });

  it("the service is never told the project: saveDraft gets the draft and the options, nothing names a project", async () => {
    questionnaireService.saveDraft.mockResolvedValue({
      ok: true,
      questionnaireId: "f1",
      versionId: "f1-v1",
      number: 1,
      created: true,
    });
    const { saveQuestionnaire } = await actions();
    await run(saveQuestionnaire("a", JSON.stringify(goodDraft)));
    const call = questionnaireService.saveDraft.mock.calls[0];
    expect(call).toHaveLength(2);
    expect(Object.keys(call[1]).filter((k) => /project/i.test(k))).toEqual([]);
  });
});

describe("the actions file, and the project door", () => {
  it("the questionnaire actions export exactly saveQuestionnaire, useQuestionnaireOnce and retireQuestionnaire", async () => {
    const mod = await actions();
    expect(Object.keys(mod).sort()).toEqual([
      "retireQuestionnaire",
      "saveQuestionnaire",
      "useQuestionnaireOnce",
    ]);
  });

  it("no questionnaire action reads the caller's admin flag", () => {
    for (const file of [ACTIONS, IMPORT_ACTIONS])
      expect(readFileSync(file, "utf8")).not.toMatch(/\.admin\b/);
  });

  it('both action files start with "use server"', () => {
    for (const file of [ACTIONS, IMPORT_ACTIONS]) {
      expect(existsSync(file), file).toBe(true);
      expect(readFileSync(file, "utf8")).toMatch(/^\s*["']use server["'];/);
    }
  });

  it("every questionnaire page, route and action lives under /p/[project]/, where the middleware applies", () => {
    for (const file of [
      ACTIONS,
      IMPORT_ACTIONS,
      `${DIR}/page.tsx`,
      `${DIR}/new/page.tsx`,
      `${DIR}/[questionnaireId]/edit/page.tsx`,
      `${DIR}/[questionnaireId]/export/route.ts`,
      `${DIR}/import/page.tsx`,
      `${DIR}/import/QuestionnaireImport.tsx`,
      `${DIR}/QuestionnaireBuilder.tsx`,
      `${DIR}/libraryData.ts`,
      "src/app/p/[project]/system/edit/FormChooser.tsx",
    ]) {
      expect(existsSync(file), file).toBe(true);
    }
  });

});

describe("editing a questionnaire that may not be edited", () => {
  const open = async (questionnaireId: string) => {
    const { default: EditPage } = await loadSrc(
      "app/p/[project]/questionnaires/[questionnaireId]/edit/page.tsx",
    );
    try {
      await EditPage({
        params: Promise.resolve({ project: "mcas", questionnaireId }),
        searchParams: Promise.resolve({}),
      });
      return "rendered";
    } catch (err) {
      if ((err as { notFound?: boolean }).notFound) return "404";
      throw err;
    }
  };

  it("/questionnaires/annex-iv-default/edit answers 404: the builtin is read-only", async () => {
    questionnaireService.latestVersion.mockResolvedValue(
      defaultVersionLiteral(),
    );
    expect(await open("annex-iv-default")).toBe("404");
  });

  it("an unlisted (use-once) questionnaire answers 404", async () => {
    questionnaireService.latestVersion.mockResolvedValue(
      formVersion({
        questionnaireId: "u1",
        questionnaireName: "Custom questions",
        listed: false,
        versionId: "u1-v1",
      }),
    );
    expect(await open("u1")).toBe("404");
  });

  it("a retired questionnaire answers 404", async () => {
    questionnaireService.latestVersion.mockResolvedValue(
      formVersion({ questionnaireId: "mix", retired: true }),
    );
    expect(await open("mix")).toBe("404");
  });

  it("an unknown questionnaire answers 404", async () => {
    questionnaireService.latestVersion.mockResolvedValue(null);
    expect(await open("nope")).toBe("404");
  });

  it("an editable questionnaire renders the builder (not a 404)", async () => {
    questionnaireService.latestVersion.mockResolvedValue(
      formVersion({
        questionnaireId: "mix",
        versionId: "mix-v2",
        versionNumber: 2,
      }),
    );
    expect(await open("mix")).toBe("rendered");
  });
});

describe("the questionnaire import actions", () => {
  const referencesFile = {
    format: "aisc-questionnaire",
    formatVersion: 1,
    bundle: "references",
    name: "Acme mix",
    description: "",
    version: 2,
    blocks: ["risks"],
    items: [
      {
        setId: "annex-iv",
        setName: "Annex IV",
        setVersion: 1,
        scope: "annex-2",
        localId: "2a",
      },
      {
        setId: "acme",
        setName: "Acme AI policy",
        setVersion: 1,
        scope: "s-acme",
        localId: "q1",
      },
    ],
  };
  const selfContainedFile = {
    ...referencesFile,
    bundle: "self-contained",
    items: referencesFile.items.map((i) => ({
      ...i,
      text: "Q?",
      citation: "",
      required: true,
      annexPoint: null,
      groupLabel: null,
    })),
  };
  const formData = (name = "acme-mix-v2.questionnaire.json") => {
    const fd = new FormData();
    fd.set("file", new File(["{}"], name, { type: "application/json" }));
    return fd;
  };

  it("a references file whose items are all here opens the builder: origin import, the file's name and blocks, the resolved picks", async () => {
    questionnaireFileClient.read.mockResolvedValue({
      ok: true,
      file: referencesFile,
    });
    const q1 = setQuestion("acme", "q1", { text: "Who signs off?" });
    const picks = [{ question: q1, setVersionId: "acme-v1" }];
    questionnaireService.resolveReferences.mockResolvedValue({
      ok: true,
      picks,
    });
    const { readQuestionnaireFile } = await importActions();
    const out = await readQuestionnaireFile("mcas", formData());
    expect(questionnaireFileClient.read).toHaveBeenCalledTimes(1);
    expect(questionnaireFileClient.read.mock.calls[0][0]).toBeInstanceOf(File);
    expect(questionnaireService.resolveReferences).toHaveBeenCalledWith(
      referencesFile.items,
    );
    expect(out).toMatchObject({
      ok: true,
      bundle: "references",
      open: { name: "Acme mix", blocks: ["risks"], origin: "import", picks },
    });
  });

  it("a references file with missing items stores nothing and lists what is missing", async () => {
    questionnaireFileClient.read.mockResolvedValue({
      ok: true,
      file: referencesFile,
    });
    const missing = [
      'Question set "Acme AI policy" (acme) v1 is not on this install.',
    ];
    questionnaireService.resolveReferences.mockResolvedValue({
      ok: false,
      missing,
    });
    const { readQuestionnaireFile } = await importActions();
    expect(await readQuestionnaireFile("mcas", formData())).toEqual({
      ok: false,
      error:
        "This questionnaire refers to questions this install does not have. Import its self-contained file, or import those question sets first.",
      missing,
    });
    expect(questionnaireService.saveDraft).not.toHaveBeenCalled();
    expect(questionnaireService.importSelfContained).not.toHaveBeenCalled();
  });

  it("a self-contained file is handed back for the create-both preview, with the file name, and nothing is stored", async () => {
    questionnaireFileClient.read.mockResolvedValue({
      ok: true,
      file: selfContainedFile,
    });
    const { readQuestionnaireFile } = await importActions();
    const out = await readQuestionnaireFile(
      "mcas",
      formData("mix.questionnaire.json"),
    );
    expect(out).toMatchObject({
      ok: true,
      bundle: "self-contained",
      file: selfContainedFile,
      fileName: "mix.questionnaire.json",
    });
    expect(questionnaireService.resolveReferences).not.toHaveBeenCalled();
    expect(questionnaireService.importSelfContained).not.toHaveBeenCalled();
  });

  it("the file service's refusal reaches the person", async () => {
    questionnaireFileClient.read.mockResolvedValue({
      ok: false,
      status: 422,
      error: "this file is not JSON",
    });
    const { readQuestionnaireFile } = await importActions();
    expect(await readQuestionnaireFile("mcas", formData())).toMatchObject({
      ok: false,
      error: "this file is not JSON",
    });
  });

  it("importSelfContained creates both through the service, as the caller, and opens the card form on the questionnaire", async () => {
    questionnaireService.importSelfContained.mockResolvedValue({
      ok: true,
      setId: "s1",
      questionnaireId: "q1",
      versionId: "q1-v1",
    });
    const { importSelfContained } = await importActions();
    const { redirected } = await run(
      importSelfContained(
        "mcas",
        JSON.stringify(selfContainedFile),
        "Acme mix questions",
        "Acme mix",
      ),
    );
    expect(questionnaireService.importSelfContained).toHaveBeenCalledWith(
      selfContainedFile,
      {
        setName: "Acme mix questions",
        questionnaireName: "Acme mix",
        createdBy: "alice",
        record: expect.any(Function), // its ledger events
      },
    );
    expect(redirected).toBe("/p/mcas/system/edit?questionnaire=q1");
  });

  it("a name error from the service reaches the person, and nothing redirects", async () => {
    questionnaireService.importSelfContained.mockResolvedValue({
      ok: false,
      error: "A questionnaire called Acme mix already exists.",
    });
    const { importSelfContained } = await importActions();
    expect(
      await importSelfContained(
        "mcas",
        JSON.stringify(selfContainedFile),
        "Acme mix questions",
        "Acme mix",
      ),
    ).toEqual({
      error: "A questionnaire called Acme mix already exists.",
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("a file argument that does not parse is refused, not thrown", async () => {
    const { importSelfContained } = await importActions();
    const out = (await importSelfContained("mcas", "{not json", "S", "Q")) as {
      error?: string;
    };
    expect(typeof out.error).toBe("string");
    expect(questionnaireService.importSelfContained).not.toHaveBeenCalled();
  });
});
