import { describe, it, expect, vi, beforeEach } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import type { ResolvedQuestionnaireVersion } from "@/domain/forms/types";

// The edit page's branching, run rather than read: which of ?example, ?questionnaire and
// ?questionnaireVersion (and the alias names ?form, ?formVersion) decides the questionnaire,
// what an unknown id does, what the chooser is given, and what QualifyForm is given when a
// card moves to another questionnaire version. The services are mocked at their
// module singletons; QualifyForm and FormChooser are replaced by markers whose props the tests
// read from the returned element tree.
//
// The page resolves ?questionnaireVersion (alias ?formVersion) through
// questionnaireService.resolve and ?questionnaire (alias ?form) through latestVersion.
// startingPoint() returns { next: {versionNumber, fromVersionNumber}, initial,
// fromQuestionnaireVersionId }.
// Chooser props: see test/unit/FormChooser.test.tsx.

const { questionnaireService, qualificationService } = vi.hoisted(() => ({
  questionnaireService: {
    latestVersion: vi.fn(),
    resolve: vi.fn(),
    chooserOptions: vi.fn(),
  },
  qualificationService: { startingPoint: vi.fn() },
}));

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
vi.mock("@/server/services/QualificationService", () => ({
  QualificationService: class {},
  qualificationService,
}));
vi.mock("@/app/p/[project]/qualify/new/QualifyForm", () => ({
  default: function QualifyForm() {
    return null;
  },
}));
vi.mock("@/app/p/[project]/system/edit/FormChooser", () => ({
  default: function FormChooser() {
    return null;
  },
}));

const page = async () =>
  (await import("@/app/p/[project]/system/edit/page")).default;

function version(
  versionId: string,
  questionnaireId: string,
  over: Partial<ResolvedQuestionnaireVersion> = {},
) {
  return {
    versionId,
    questionnaireId,
    questionnaireName: `Questionnaire ${questionnaireId}`,
    description: "",
    versionNumber: 1,
    listed: true,
    builtin: false,
    retired: false,
    blocks: [],
    questions: [],
    ...over,
  } as unknown as ResolvedQuestionnaireVersion;
}

const row = (
  id: string,
  name: string,
  version: number,
  questionCount: number,
  versionIds: string[],
) => ({
  questionnaireId: id,
  name,
  description: "",
  origin: id === "annex-iv-default" ? "builtin" : "builder",
  builtin: id === "annex-iv-default",
  isDefault: id === "annex-iv-default",
  versionId: versionIds.at(-1)!,
  version,
  questionCount,
  savedBy: "system",
  savedAt: "2026-09-25T09:00:00.000Z",
  retiredAt: null,
  updates: 0,
  versionIds,
});

const OPTIONS = [
  row("annex-iv-default", "Annex IV default", 1, 14, ["annex-iv-default-v1"]),
  row("acme", "Acme AI policy", 2, 18, ["acme-v1", "acme-v2"]),
];

/** Every element in the tree whose component has this name. */
function find(
  node: ReactNode,
  name: string,
): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((n) => find(n, name));
  if (!isValidElement(node)) return [];
  const el = node as ReactElement<Record<string, unknown>>;
  const type = el.type as { name?: string } | string;
  const here = typeof type !== "string" && type?.name === name ? [el] : [];
  return [...here, ...find(el.props.children as ReactNode, name)];
}

async function open(search: Record<string, string>) {
  const EditSystemPage = await page();
  const tree = await EditSystemPage({
    params: Promise.resolve({ project: "mcas" }),
    searchParams: Promise.resolve(search),
  } as never);
  return {
    form: find(tree, "QualifyForm")[0]?.props,
    chooser: find(tree, "FormChooser")[0]?.props,
  };
}

const VERSIONS: Record<string, ResolvedQuestionnaireVersion> = {
  "u1-v1": version("u1-v1", "u1", {
    listed: false,
    questionnaireName: "Custom questions",
  }),
  "acme-v1": version("acme-v1", "acme", {
    questionnaireName: "Acme AI policy",
    versionNumber: 1,
  }),
  "acme-v2": version("acme-v2", "acme", {
    questionnaireName: "Acme AI policy",
    versionNumber: 2,
  }),
  "annex-iv-default-v1": version("annex-iv-default-v1", "annex-iv-default", {
    questionnaireName: "Annex IV default",
    builtin: true,
  }),
  "old-v3": version("old-v3", "old", {
    questionnaireName: "Old policy",
    versionNumber: 3,
    retired: true,
  }),
};

beforeEach(() => {
  vi.clearAllMocks();
  questionnaireService.chooserOptions.mockResolvedValue(OPTIONS);
  questionnaireService.latestVersion.mockImplementation(async (id: string) =>
    id === "acme"
      ? VERSIONS["acme-v2"]
      : id === "annex-iv-default"
        ? VERSIONS["annex-iv-default-v1"]
        : null,
  );
  questionnaireService.resolve.mockImplementation(async (id: string | null) =>
    id === "u1-v1" ? VERSIONS["u1-v1"] : null,
  );
  qualificationService.startingPoint.mockResolvedValue(null);
});

/** A next card: the latest card is v<from>, filled with questionnaire version P. */
function previousCard(p: string, from = 2) {
  qualificationService.startingPoint.mockResolvedValue({
    next: { versionNumber: from + 1, fromVersionNumber: from, fromCardId: `card-${from}` },
    initial: { systemName: "MCAS" },
    fromQuestionnaireVersionId: p,
  });
  questionnaireService.resolve.mockImplementation(async (id: string | null) =>
    id ? (VERSIONS[id] ?? null) : null,
  );
}

describe("the edit page picks the questionnaire from the URL", () => {
  it("nothing named: the chooser, with the Annex IV default preselected and no message", async () => {
    const { form, chooser } = await open({});
    expect(form).toBeUndefined();
    expect(chooser).toBeDefined();
    expect(chooser!.error).toBeNull();
    expect(chooser!.preselected).toEqual({
      param: "questionnaire",
      id: "annex-iv-default",
    });
    expect(chooser!.previous).toBeNull();
    expect(chooser!.options).toEqual([
      {
        questionnaireId: "annex-iv-default",
        name: "Annex IV default",
        versionNumber: 1,
        questionCount: 14,
        isDefault: true,
        versionId: "annex-iv-default-v1",
        versionIds: ["annex-iv-default-v1"],
      },
      {
        questionnaireId: "acme",
        name: "Acme AI policy",
        versionNumber: 2,
        questionCount: 18,
        isDefault: false,
        versionId: "acme-v2",
        versionIds: ["acme-v1", "acme-v2"],
      },
    ]);
    expect(questionnaireService.latestVersion).not.toHaveBeenCalled();
  });

  it.each([["questionnaire"], ["form"]])(
    "?%s=<id>: that questionnaire's latest version is filled, no chooser",
    async (param) => {
      const { form, chooser } = await open({ [param]: "acme" });
      expect(chooser).toBeUndefined();
      expect(questionnaireService.latestVersion).toHaveBeenCalledWith("acme");
      expect((form!.form as ResolvedQuestionnaireVersion).versionId).toBe(
        "acme-v2",
      );
      expect(form!.project).toBe("mcas");
      expect(questionnaireService.chooserOptions).not.toHaveBeenCalled();
    },
  );

  it.each([["questionnaireVersion"], ["formVersion"]])(
    "?%s=<id>: that very version is filled, listed or not",
    async (param) => {
      const { form, chooser } = await open({ [param]: "u1-v1" });
      expect(chooser).toBeUndefined();
      expect(questionnaireService.resolve).toHaveBeenCalledWith("u1-v1");
      expect((form!.form as ResolvedQuestionnaireVersion).versionId).toBe(
        "u1-v1",
      );
    },
  );

  it("?example=mcas: the default version, already filled, no chooser and no starting card", async () => {
    const { form, chooser } = await open({ example: "mcas" });
    expect(chooser).toBeUndefined();
    expect((form!.form as ResolvedQuestionnaireVersion).versionId).toBe(
      "annex-iv-default-v1",
    );
    expect((form!.form as ResolvedQuestionnaireVersion).questionnaireName).toBe(
      "Annex IV default",
    );
    expect(form!.initial).toBeDefined();
    expect(qualificationService.startingPoint).not.toHaveBeenCalled();
    expect(questionnaireService.latestVersion).not.toHaveBeenCalled();
    expect(questionnaireService.resolve).not.toHaveBeenCalled();
  });

  it("?example wins over every questionnaire parameter", async () => {
    const { form } = await open({
      example: "mcas",
      questionnaire: "acme",
      questionnaireVersion: "u1-v1",
      form: "acme",
      formVersion: "u1-v1",
    });
    expect((form!.form as ResolvedQuestionnaireVersion).versionId).toBe(
      "annex-iv-default-v1",
    );
  });

  it("?questionnaireVersion wins over ?questionnaire when both are given", async () => {
    const { form, chooser } = await open({
      questionnaire: "acme",
      questionnaireVersion: "u1-v1",
    });
    expect(chooser).toBeUndefined();
    expect((form!.form as ResolvedQuestionnaireVersion).versionId).toBe(
      "u1-v1",
    );
    expect(questionnaireService.latestVersion).not.toHaveBeenCalled();
  });

  it("the old ?formVersion wins over ?questionnaire", async () => {
    const { form } = await open({
      questionnaire: "acme",
      formVersion: "u1-v1",
    });
    expect((form!.form as ResolvedQuestionnaireVersion).versionId).toBe(
      "u1-v1",
    );
    expect(questionnaireService.latestVersion).not.toHaveBeenCalled();
  });

  it("?questionnaireVersion wins over the old ?formVersion", async () => {
    questionnaireService.resolve.mockImplementation(
      async (id: string | null) => (id ? (VERSIONS[id] ?? null) : null),
    );
    const { form } = await open({
      questionnaireVersion: "acme-v1",
      formVersion: "u1-v1",
    });
    expect((form!.form as ResolvedQuestionnaireVersion).versionId).toBe(
      "acme-v1",
    );
  });

  it("?questionnaire wins over the old ?form", async () => {
    const { form } = await open({
      questionnaire: "acme",
      form: "annex-iv-default",
    });
    expect(questionnaireService.latestVersion).toHaveBeenCalledWith("acme");
    expect((form!.form as ResolvedQuestionnaireVersion).versionId).toBe(
      "acme-v2",
    );
  });

  it("an unknown ?example is ignored: the named questionnaire is still used", async () => {
    const { form } = await open({ example: "nope", questionnaire: "acme" });
    expect((form!.form as ResolvedQuestionnaireVersion).versionId).toBe(
      "acme-v2",
    );
  });

  it.each([
    [{ questionnaire: "gone" }],
    [{ questionnaireVersion: "gone-v1" }],
    [{ form: "gone" }],
    [{ formVersion: "gone-v1" }],
  ])(
    'an unknown id (%o): the chooser, "That questionnaire was not found." and the usual preselection',
    async (search) => {
      const { form, chooser } = await open(search);
      expect(form).toBeUndefined();
      expect(chooser!.error).toBe("That questionnaire was not found.");
      expect(chooser!.preselected).toEqual({
        param: "questionnaire",
        id: "annex-iv-default",
      });
    },
  );

  it.each([
    ["absent", {}],
    ["known", { questionnaire: "acme" }],
    ["known, old name", { form: "acme" }],
  ])(
    "an unknown ?questionnaireVersion never falls back to a questionnaire parameter (%s)",
    async (_l, extra) => {
      const { form, chooser } = await open({
        questionnaireVersion: "gone-v1",
        ...extra,
      });
      expect(form).toBeUndefined();
      expect(chooser!.error).toBe("That questionnaire was not found.");
      expect(questionnaireService.latestVersion).not.toHaveBeenCalled();
    },
  );

  it("nothing named (empty strings are absent) is the chooser, no message", async () => {
    const { form, chooser } = await open({
      questionnaire: "",
      questionnaireVersion: "",
      form: "",
      formVersion: "",
      example: "",
    });
    expect(form).toBeUndefined();
    expect(chooser!.error).toBeNull();
    expect(questionnaireService.resolve).not.toHaveBeenCalledWith("");
    expect(questionnaireService.latestVersion).not.toHaveBeenCalled();
  });

  // A failed lookup of the starting card used to be read as "no card yet", so
  // the page offered an empty form; saving it built the next version from scratch and every
  // component got a new key. Now it says the platform did not answer, and offers no form.
  it("the starting card failing to load shows the platform notice, no chooser and no form", async () => {
    qualificationService.startingPoint.mockRejectedValue(
      new Error("platform down"),
    );
    for (const search of [{}, { questionnaire: "acme" }]) {
      const EditSystemPage = await page();
      const tree = await EditSystemPage({
        params: Promise.resolve({ project: "mcas" }),
        searchParams: Promise.resolve(search),
      } as never);
      expect(find(tree, "QualifyForm")).toEqual([]);
      expect(find(tree, "FormChooser")).toEqual([]);
      expect(JSON.stringify(tree)).toMatch(/platform did not answer/);
    }
  });

  it("the example still opens without asking for a starting card", async () => {
    qualificationService.startingPoint.mockRejectedValue(
      new Error("platform down"),
    );
    const { form } = await open({ example: "mcas" });
    expect(form).toBeDefined();
  });
});

describe("a next card starts on the exact previous version", () => {
  it("a legacy card (P = annex-iv-default-v1, the default's latest): the default is preselected, labelled same as vN", async () => {
    previousCard("annex-iv-default-v1", 2);
    const { chooser } = await open({});
    expect(chooser!.preselected).toEqual({
      param: "questionnaire",
      id: "annex-iv-default",
    });
    expect(chooser!.previous).toEqual({
      cardVersionNumber: 2,
      versionId: "annex-iv-default-v1",
      name: "Annex IV default",
      versionNumber: 1,
    });
  });

  it("P is the latest of a listed questionnaire: that questionnaire is preselected", async () => {
    previousCard("acme-v2", 4);
    const { chooser } = await open({});
    expect(chooser!.preselected).toEqual({
      param: "questionnaire",
      id: "acme",
    });
    expect(chooser!.previous).toEqual({
      cardVersionNumber: 4,
      versionId: "acme-v2",
      name: "Acme AI policy",
      versionNumber: 2,
    });
  });

  it("P is an older version: that exact version is preselected, never the newer one", async () => {
    previousCard("acme-v1", 4);
    const { chooser } = await open({});
    expect(chooser!.preselected).toEqual({
      param: "questionnaireVersion",
      id: "acme-v1",
    });
    expect(chooser!.previous).toEqual({
      cardVersionNumber: 4,
      versionId: "acme-v1",
      name: "Acme AI policy",
      versionNumber: 1,
    });
  });

  it("a use-once version is offered again", async () => {
    previousCard("u1-v1", 2);
    const { chooser } = await open({});
    expect(chooser!.preselected).toEqual({
      param: "questionnaireVersion",
      id: "u1-v1",
    });
    expect(chooser!.previous).toEqual({
      cardVersionNumber: 2,
      versionId: "u1-v1",
      name: "Custom questions",
      versionNumber: 1,
    });
  });

  it("a retired questionnaire's version is offered again", async () => {
    previousCard("old-v3", 7);
    const { chooser } = await open({});
    expect(chooser!.preselected).toEqual({
      param: "questionnaireVersion",
      id: "old-v3",
    });
    expect(chooser!.previous).toEqual({
      cardVersionNumber: 7,
      versionId: "old-v3",
      name: "Old policy",
      versionNumber: 3,
    });
  });

  it("a first card is preselected by the constant, not by the options' order or flags", async () => {
    questionnaireService.chooserOptions.mockResolvedValue(
      [...OPTIONS].reverse().map((o) => ({ ...o, isDefault: false })),
    );
    const { chooser } = await open({});
    expect(chooser!.preselected).toEqual({
      param: "questionnaire",
      id: "annex-iv-default",
    });
  });
});

describe("moving a card to another questionnaire version", () => {
  it("a chosen version V other than the previous card's P: QualifyForm gets previous (P resolved) and cardNumber", async () => {
    previousCard("acme-v1", 4);
    const { form } = await open({ questionnaire: "acme" });
    expect((form!.form as ResolvedQuestionnaireVersion).versionId).toBe(
      "acme-v2",
    );
    expect((form!.previous as ResolvedQuestionnaireVersion).versionId).toBe(
      "acme-v1",
    );
    expect(form!.cardNumber).toBe(4);
  });

  it("moving to a different questionnaire also passes previous", async () => {
    previousCard("annex-iv-default-v1", 3);
    const { form } = await open({ questionnaireVersion: "u1-v1" });
    expect((form!.form as ResolvedQuestionnaireVersion).versionId).toBe(
      "u1-v1",
    );
    expect((form!.previous as ResolvedQuestionnaireVersion).versionId).toBe(
      "annex-iv-default-v1",
    );
    expect(form!.cardNumber).toBe(3);
  });

  it("the same version as the previous card: no previous is passed", async () => {
    previousCard("acme-v2", 4);
    const { form } = await open({ questionnaire: "acme" });
    expect((form!.form as ResolvedQuestionnaireVersion).versionId).toBe(
      "acme-v2",
    );
    expect(form!.previous ?? null).toBeNull();
  });

  it("a first card (no previous card): no previous is passed", async () => {
    const { form } = await open({ questionnaire: "acme" });
    expect(form!.previous ?? null).toBeNull();
  });
});

describe("the edit page lays the form out with the card's left menu", () => {
  it("hands the form its title and the project's links, for the panel and the menu", async () => {
    const { form } = await open({ questionnaire: "acme" });
    expect(form).toBeDefined();
    expect(form!.header).toBeTruthy();
    expect(form!.nav).toBeTruthy();
    expect((form!.nav as ReactElement<{ withSystem?: boolean }>).props.withSystem).toBe(false);
  });

  it("says that a save makes the next version, and takes the card's review along", async () => {
    previousCard("acme-v2", 4);
    const { form } = await open({ questionnaire: "acme" });
    const text = (node: ReactNode): string =>
      Array.isArray(node)
        ? node.map(text).join("")
        : isValidElement(node)
          ? text((node.props as { children?: ReactNode }).children)
          : typeof node === "string" || typeof node === "number"
            ? String(node)
            : "";
    expect(text(form!.header as ReactNode)).toContain(
      "Saving makes v5 of the AI card; earlier versions stay as they were. " +
        "Corrections made on v4's AI card come along where their item is the same.",
    );
  });

  it("a first card has no review to take along, and says nothing about one", async () => {
    qualificationService.startingPoint.mockResolvedValue({
      next: { versionNumber: 1, fromVersionNumber: null, fromCardId: null },
      initial: null,
      fromQuestionnaireVersionId: null,
    });
    const { form } = await open({ questionnaire: "acme" });
    const text = (node: ReactNode): string =>
      Array.isArray(node)
        ? node.map(text).join("")
        : isValidElement(node)
          ? text((node.props as { children?: ReactNode }).children)
          : typeof node === "string" || typeof node === "number"
            ? String(node)
            : "";
    const said = text(form!.header as ReactNode);
    expect(said).toContain("Saving makes v1 of the AI card; earlier versions stay as they were.");
    expect(said).not.toContain("Corrections made on");
  });

  it("names the version a save makes, and cancels back to the card it starts from", async () => {
    previousCard("acme-v2", 4);
    const { form } = await open({ questionnaire: "acme" });
    expect(form!.saveLabel).toBe("Save as v5");
    expect(form!.cancelHref).toBe("/p/mcas/qualify/card-4");
  });

  it("a first card, or a worked example: a plain save, and Cancel goes to the versions", async () => {
    const searches: Record<string, string>[] = [{ questionnaire: "acme" }, { example: "mcas" }];
    for (const search of searches) {
      const { form } = await open(search);
      expect(form!.saveLabel).toBe("Save the AI card");
      expect(form!.cancelHref).toBe("/p/mcas/qualifications");
    }
  });
});
