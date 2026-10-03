import { describe, it, expect, vi, beforeEach } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import type { ResolvedQuestionnaireVersion } from "@/domain/forms/types";
import { readFileSync } from "node:fs";

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

const page = async () => (await import("@/app/p/[project]/system/edit/page")).default;

function version(versionId: string, questionnaireId: string, over: Partial<ResolvedQuestionnaireVersion> = {}) {
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

const row = (id: string, name: string, version: number, questionCount: number, versionIds: string[]) => ({
  questionnaireId: id, name, description: "", origin: id === "annex-iv-default" ? "builtin" : "builder",
  builtin: id === "annex-iv-default", isDefault: id === "annex-iv-default", versionId: versionIds.at(-1)!,
  version, questionCount, savedBy: "system", savedAt: "2026-09-25T09:00:00.000Z", retiredAt: null, updates: 0,
  versionIds,
});

const OPTIONS = [
  row("annex-iv-default", "Annex IV default", 1, 14, ["annex-iv-default-v1"]),
  row("acme", "Acme AI policy", 2, 18, ["acme-v1", "acme-v2"]),
];

/** Every element in the tree whose component has this name. */
function find(node: ReactNode, name: string): ReactElement<Record<string, unknown>>[] {
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
  "u1-v1": version("u1-v1", "u1", { listed: false, questionnaireName: "Custom questions" }),
  "acme-v1": version("acme-v1", "acme", { questionnaireName: "Acme AI policy", versionNumber: 1 }),
  "acme-v2": version("acme-v2", "acme", { questionnaireName: "Acme AI policy", versionNumber: 2 }),
  "annex-iv-default-v1": version("annex-iv-default-v1", "annex-iv-default", {
    questionnaireName: "Annex IV default", builtin: true,
  }),
  "old-v3": version("old-v3", "old", { questionnaireName: "Old policy", versionNumber: 3, retired: true }),
};

beforeEach(() => {
  vi.clearAllMocks();
  questionnaireService.chooserOptions.mockResolvedValue(OPTIONS);
  questionnaireService.latestVersion.mockImplementation(async (id: string) =>
    id === "acme" ? VERSIONS["acme-v2"] : id === "annex-iv-default" ? VERSIONS["annex-iv-default-v1"] : null,
  );
  questionnaireService.resolve.mockImplementation(async (id: string | null) =>
    id === "u1-v1" ? VERSIONS["u1-v1"] : null,
  );
  qualificationService.startingPoint.mockResolvedValue(null);
});

/** A next card: the latest card is v<from>, filled with questionnaire version P. */
function previousCard(p: string, from = 2) {
  qualificationService.startingPoint.mockResolvedValue({
    next: { versionNumber: from + 1, fromVersionNumber: from },
    initial: { systemName: "MCAS" },
    fromQuestionnaireVersionId: p,
  });
  questionnaireService.resolve.mockImplementation(async (id: string | null) => (id ? VERSIONS[id] ?? null : null));
}

describe("the edit page picks the questionnaire from the URL (R8, T39)", () => {
  it("T39 R46 nothing named: the chooser, with the Annex IV default preselected and no message", async () => {
    const { form, chooser } = await open({});
    expect(form).toBeUndefined();
    expect(chooser).toBeDefined();
    expect(chooser!.error).toBeNull();
    expect(chooser!.preselected).toEqual({ param: "questionnaire", id: "annex-iv-default" });
    expect(chooser!.previous).toBeNull();
    expect(chooser!.options).toEqual([
      {
        questionnaireId: "annex-iv-default", name: "Annex IV default", versionNumber: 1, questionCount: 14,
        isDefault: true, versionId: "annex-iv-default-v1", versionIds: ["annex-iv-default-v1"],
      },
      {
        questionnaireId: "acme", name: "Acme AI policy", versionNumber: 2, questionCount: 18, isDefault: false,
        versionId: "acme-v2", versionIds: ["acme-v1", "acme-v2"],
      },
    ]);
    expect(questionnaireService.latestVersion).not.toHaveBeenCalled();
  });

  it.each([["questionnaire"], ["form"]])("T39 ?%s=<id>: that questionnaire's latest version is filled, no chooser", async (param) => {
    const { form, chooser } = await open({ [param]: "acme" });
    expect(chooser).toBeUndefined();
    expect(questionnaireService.latestVersion).toHaveBeenCalledWith("acme");
    expect((form!.form as ResolvedQuestionnaireVersion).versionId).toBe("acme-v2");
    expect(form!.project).toBe("mcas");
    expect(questionnaireService.chooserOptions).not.toHaveBeenCalled();
  });

  it.each([["questionnaireVersion"], ["formVersion"]])("T39 ?%s=<id>: that very version is filled, listed or not", async (param) => {
    const { form, chooser } = await open({ [param]: "u1-v1" });
    expect(chooser).toBeUndefined();
    expect(questionnaireService.resolve).toHaveBeenCalledWith("u1-v1");
    expect((form!.form as ResolvedQuestionnaireVersion).versionId).toBe("u1-v1");
  });

  it("T39 ?example=mcas: the default version, already filled, no chooser and no starting card", async () => {
    const { form, chooser } = await open({ example: "mcas" });
    expect(chooser).toBeUndefined();
    expect((form!.form as ResolvedQuestionnaireVersion).versionId).toBe("annex-iv-default-v1");
    expect((form!.form as ResolvedQuestionnaireVersion).questionnaireName).toBe("Annex IV default");
    expect(form!.initial).toBeDefined();
    expect(qualificationService.startingPoint).not.toHaveBeenCalled();
    expect(questionnaireService.latestVersion).not.toHaveBeenCalled();
    expect(questionnaireService.resolve).not.toHaveBeenCalled();
  });

  it("T39 ?example wins over every questionnaire parameter", async () => {
    const { form } = await open({
      example: "mcas", questionnaire: "acme", questionnaireVersion: "u1-v1", form: "acme", formVersion: "u1-v1",
    });
    expect((form!.form as ResolvedQuestionnaireVersion).versionId).toBe("annex-iv-default-v1");
  });

  it("T39 ?questionnaireVersion wins over ?questionnaire when both are given", async () => {
    const { form, chooser } = await open({ questionnaire: "acme", questionnaireVersion: "u1-v1" });
    expect(chooser).toBeUndefined();
    expect((form!.form as ResolvedQuestionnaireVersion).versionId).toBe("u1-v1");
    expect(questionnaireService.latestVersion).not.toHaveBeenCalled();
  });

  it("T39 the old ?formVersion wins over ?questionnaire", async () => {
    const { form } = await open({ questionnaire: "acme", formVersion: "u1-v1" });
    expect((form!.form as ResolvedQuestionnaireVersion).versionId).toBe("u1-v1");
    expect(questionnaireService.latestVersion).not.toHaveBeenCalled();
  });

  it("T39 ?questionnaireVersion wins over the old ?formVersion", async () => {
    questionnaireService.resolve.mockImplementation(async (id: string | null) => (id ? VERSIONS[id] ?? null : null));
    const { form } = await open({ questionnaireVersion: "acme-v1", formVersion: "u1-v1" });
    expect((form!.form as ResolvedQuestionnaireVersion).versionId).toBe("acme-v1");
  });

  it("T39 ?questionnaire wins over the old ?form", async () => {
    const { form } = await open({ questionnaire: "acme", form: "annex-iv-default" });
    expect(questionnaireService.latestVersion).toHaveBeenCalledWith("acme");
    expect((form!.form as ResolvedQuestionnaireVersion).versionId).toBe("acme-v2");
  });

  it("T39 an unknown ?example is ignored: the named questionnaire is still used", async () => {
    const { form } = await open({ example: "nope", questionnaire: "acme" });
    expect((form!.form as ResolvedQuestionnaireVersion).versionId).toBe("acme-v2");
  });

  it.each([
    [{ questionnaire: "gone" }],
    [{ questionnaireVersion: "gone-v1" }],
    [{ form: "gone" }],
    [{ formVersion: "gone-v1" }],
  ])('T39 an unknown id (%o): the chooser, "That questionnaire was not found." and the usual preselection', async (search) => {
    const { form, chooser } = await open(search);
    expect(form).toBeUndefined();
    expect(chooser!.error).toBe("That questionnaire was not found.");
    expect(chooser!.preselected).toEqual({ param: "questionnaire", id: "annex-iv-default" });
  });

  it.each([
    ["absent", {}],
    ["known", { questionnaire: "acme" }],
    ["known, old name", { form: "acme" }],
  ])("T39 an unknown ?questionnaireVersion never falls back to a questionnaire parameter (%s)", async (_l, extra) => {
    const { form, chooser } = await open({ questionnaireVersion: "gone-v1", ...extra });
    expect(form).toBeUndefined();
    expect(chooser!.error).toBe("That questionnaire was not found.");
    expect(questionnaireService.latestVersion).not.toHaveBeenCalled();
  });

  it("T39 nothing named (empty strings are absent) is the chooser, no message", async () => {
    const { form, chooser } = await open({ questionnaire: "", questionnaireVersion: "", form: "", formVersion: "", example: "" });
    expect(form).toBeUndefined();
    expect(chooser!.error).toBeNull();
    expect(questionnaireService.resolve).not.toHaveBeenCalledWith("");
    expect(questionnaireService.latestVersion).not.toHaveBeenCalled();
  });

  it("T39 the starting card failing to load still shows the chooser", async () => {
    qualificationService.startingPoint.mockRejectedValue(new Error("platform down"));
    const { chooser } = await open({});
    expect(chooser!.preselected).toEqual({ param: "questionnaire", id: "annex-iv-default" });
    expect(chooser!.previous).toBeNull();
  });
});

describe("a next card starts on the exact previous version (T37, T38)", () => {
  it("T37 T38 a legacy card (P = annex-iv-default-v1, the default's latest): the default is preselected, labelled same as vN", async () => {
    previousCard("annex-iv-default-v1", 2);
    const { chooser } = await open({});
    expect(chooser!.preselected).toEqual({ param: "questionnaire", id: "annex-iv-default" });
    expect(chooser!.previous).toEqual({
      cardVersionNumber: 2, versionId: "annex-iv-default-v1", name: "Annex IV default", versionNumber: 1,
    });
  });

  it("T37 T38 P is the latest of a listed questionnaire: that questionnaire is preselected", async () => {
    previousCard("acme-v2", 4);
    const { chooser } = await open({});
    expect(chooser!.preselected).toEqual({ param: "questionnaire", id: "acme" });
    expect(chooser!.previous).toEqual({ cardVersionNumber: 4, versionId: "acme-v2", name: "Acme AI policy", versionNumber: 2 });
  });

  it("T37 T38 D11 P is an older version: that exact version is preselected, never the newer one", async () => {
    previousCard("acme-v1", 4);
    const { chooser } = await open({});
    expect(chooser!.preselected).toEqual({ param: "questionnaireVersion", id: "acme-v1" });
    expect(chooser!.previous).toEqual({ cardVersionNumber: 4, versionId: "acme-v1", name: "Acme AI policy", versionNumber: 1 });
  });

  it("T37 a use-once version is offered again", async () => {
    previousCard("u1-v1", 2);
    const { chooser } = await open({});
    expect(chooser!.preselected).toEqual({ param: "questionnaireVersion", id: "u1-v1" });
    expect(chooser!.previous).toEqual({ cardVersionNumber: 2, versionId: "u1-v1", name: "Custom questions", versionNumber: 1 });
  });

  it("T38 D10 a retired questionnaire's version is offered again", async () => {
    previousCard("old-v3", 7);
    const { chooser } = await open({});
    expect(chooser!.preselected).toEqual({ param: "questionnaireVersion", id: "old-v3" });
    expect(chooser!.previous).toEqual({ cardVersionNumber: 7, versionId: "old-v3", name: "Old policy", versionNumber: 3 });
  });

  it("T37 R46 a first card is preselected by the constant, not by the options' order or flags", async () => {
    questionnaireService.chooserOptions.mockResolvedValue([...OPTIONS].reverse().map((o) => ({ ...o, isDefault: false })));
    const { chooser } = await open({});
    expect(chooser!.preselected).toEqual({ param: "questionnaire", id: "annex-iv-default" });
  });

  it("R46 the page source derives no default from the options", () => {
    const source = readFileSync("src/app/p/[project]/system/edit/page.tsx", "utf8");
    expect(source).not.toMatch(/defaultFormId/);
    expect(source).not.toMatch(/find\(\(o\) => o\.isDefault\)/);
  });
});

describe("moving a card to another questionnaire version (T41)", () => {
  it("T41 a chosen version V other than the previous card's P: QualifyForm gets previous (P resolved) and cardNumber", async () => {
    previousCard("acme-v1", 4);
    const { form } = await open({ questionnaire: "acme" });
    expect((form!.form as ResolvedQuestionnaireVersion).versionId).toBe("acme-v2");
    expect((form!.previous as ResolvedQuestionnaireVersion).versionId).toBe("acme-v1");
    expect(form!.cardNumber).toBe(4);
  });

  it("T41 moving to a different questionnaire also passes previous", async () => {
    previousCard("annex-iv-default-v1", 3);
    const { form } = await open({ questionnaireVersion: "u1-v1" });
    expect((form!.form as ResolvedQuestionnaireVersion).versionId).toBe("u1-v1");
    expect((form!.previous as ResolvedQuestionnaireVersion).versionId).toBe("annex-iv-default-v1");
    expect(form!.cardNumber).toBe(3);
  });

  it("T41 the same version as the previous card: no previous is passed", async () => {
    previousCard("acme-v2", 4);
    const { form } = await open({ questionnaire: "acme" });
    expect((form!.form as ResolvedQuestionnaireVersion).versionId).toBe("acme-v2");
    expect(form!.previous ?? null).toBeNull();
  });

  it("T41 a first card (no previous card): no previous is passed", async () => {
    const { form } = await open({ questionnaire: "acme" });
    expect(form!.previous ?? null).toBeNull();
  });
});
