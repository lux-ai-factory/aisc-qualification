import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isValidElement, type ReactElement, type ReactNode } from "react";

// Saving the AI card asks one question: did the system change (a new version) or is the
// description of the same version being corrected (a revision)? The action refuses a save
// that does not say, routes each answer to its service call, and records each with its own
// ledger event. The edit page offers the correction only on the latest version's latest card.

const { qualificationService, emitEvent, redirect } = vi.hoisted(() => ({
  qualificationService: {
    createFromForm: vi.fn(),
    reviseFromForm: vi.fn(),
    startingPoint: vi.fn(),
  },
  emitEvent: vi.fn(async () => undefined),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect, notFound: vi.fn() }));
vi.mock("@/lib/projectDb", () => ({
  projectDbForAction: async () => ({ db: {} }),
  projectDbPastDoor: async () => ({}),
}));
vi.mock("@/vendor/aisc-ledger/emit", () => ({ emitEvent }));
vi.mock("@/server/services/QualificationService", () => ({
  QualificationService: class {},
  qualificationService,
}));
const FORM = {
  versionId: "v",
  questionnaireId: "q",
  questionnaireName: "Q",
  versionNumber: 1,
  blocks: [],
  questions: [],
};
vi.mock("@/server/services/QuestionnaireService", () => ({
  questionnairesOn: () => ({
    latestVersion: async () => FORM,
    resolve: async () => FORM,
    chooserOptions: async () => [],
  }),
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

const TX = { tx: true };
const card = (over: Record<string, unknown> = {}) => ({
  id: "card-2",
  input: {
    questionnaireVersionId: "qv",
    risks: [{}, {}],
    systemComponents: [{}],
  },
  ...over,
});

const submit = async (fields: Record<string, string>) => {
  const { submitQualification } = await import(
    "@/app/p/[project]/qualify/new/actions"
  );
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return submitQualification("mcas", undefined, fd);
};

beforeEach(() => {
  vi.clearAllMocks();
  qualificationService.createFromForm.mockImplementation(
    async (_p: string, _f: FormData, record: (tx: unknown, c: unknown) => Promise<unknown>) => {
      await record(TX, card({ id: "card-new" }));
      return { id: "card-new" };
    },
  );
  qualificationService.reviseFromForm.mockImplementation(
    async (
      _p: string,
      _f: FormData,
      _a: unknown,
      record: (tx: unknown, c: unknown) => Promise<unknown>,
    ) => {
      await record(TX, card({ id: "card-2b", revision: 2, amendsId: "card-2" }));
      return { id: "card-2b" };
    },
  );
});

describe("the save says whether the system changed or its description is corrected", () => {
  it("no choice is refused", async () => {
    const out = await submit({});
    expect(out).toEqual({
      error:
        "Choose whether the system changed or you are correcting its description.",
    });
    expect(qualificationService.createFromForm).not.toHaveBeenCalled();
    expect(qualificationService.reviseFromForm).not.toHaveBeenCalled();
  });

  it("an unknown choice is refused too", async () => {
    const out = await submit({ change: "both" });
    expect(out?.error).toMatch(/^Choose whether/);
    expect(qualificationService.createFromForm).not.toHaveBeenCalled();
  });

  it('"system" calls createFromForm and emits qualification.created as today', async () => {
    await expect(submit({ change: "system" })).rejects.toThrow(
      "NEXT_REDIRECT /p/mcas/qualify/card-new",
    );
    expect(qualificationService.reviseFromForm).not.toHaveBeenCalled();
    expect(emitEvent).toHaveBeenCalledTimes(1);
    expect(emitEvent).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        action: "qualification.created",
        itemType: "qualification",
        itemId: "card-new",
      }),
    );
  });

  it('"correction" calls reviseFromForm and emits qualification.amended with reason and requested_by', async () => {
    await expect(
      submit({
        change: "correction",
        amendsId: "card-2",
        amendReason: "  Provider name was wrong ",
        amendRequestedBy: " Eindhoven Engine, email of 10 Nov ",
      }),
    ).rejects.toThrow("NEXT_REDIRECT /p/mcas/qualify/card-2b");
    expect(qualificationService.createFromForm).not.toHaveBeenCalled();
    expect(qualificationService.reviseFromForm).toHaveBeenCalledWith(
      "mcas",
      expect.any(FormData),
      {
        reason: "Provider name was wrong",
        requestedBy: "Eindhoven Engine, email of 10 Nov",
      },
      expect.any(Function),
    );
    expect(emitEvent).toHaveBeenCalledTimes(1);
    expect(emitEvent).toHaveBeenCalledWith(TX, {
      action: "qualification.amended",
      itemType: "qualification",
      itemId: "card-2b",
      details: {
        revision: 2,
        amends: "card-2",
        reason: "Provider name was wrong",
        requested_by: "Eindhoven Engine, email of 10 Nov",
        risks: 2,
        components: 1,
      },
      content: card().input,
    });
  });

  it("a correction refused by the service comes back as the form's error", async () => {
    const { FormValidationError } = await import(
      "@/server/forms/QualificationFormParser"
    );
    qualificationService.reviseFromForm.mockRejectedValue(
      new FormValidationError("Say why the description is corrected and who asked for it."),
    );
    const out = await submit({ change: "correction" });
    expect(out).toEqual({
      error: "Say why the description is corrected and who asked for it.",
    });
  });
});

describe("the edit page offers the correction only when editing the latest card", () => {
  async function open() {
    const Page = (await import("@/app/p/[project]/system/edit/page")).default;
    const tree = await Page({
      params: Promise.resolve({ project: "mcas" }),
      searchParams: Promise.resolve({ questionnaire: "q" }),
    } as never);
    const find = (n: ReactNode): ReactElement<Record<string, unknown>>[] =>
      Array.isArray(n)
        ? n.flatMap(find)
        : isValidElement(n)
          ? [
              ...((n.type as { name?: string }).name === "QualifyForm"
                ? [n as ReactElement<Record<string, unknown>>]
                : []),
              ...find((n.props as { children?: ReactNode }).children),
            ]
          : [];
    return find(tree)[0]?.props;
  }
  const start = (next: object, fromRevision?: number) =>
    qualificationService.startingPoint.mockResolvedValue({
      next,
      initial: { systemName: "MCAS" },
      fromQuestionnaireVersionId: "qv",
      ...(fromRevision !== undefined && { fromRevision }),
    });

  it("the latest version's card: offered, naming the card and the revision it would make", async () => {
    start({ versionNumber: 3, fromVersionNumber: 2, fromCardId: "card-2" }, 1);
    expect((await open())?.correction).toEqual({
      amendsId: "card-2",
      versionNumber: 2,
      nextRevision: 2,
    });
  });

  it("a card already revised: the next revision follows its own", async () => {
    start({ versionNumber: 3, fromVersionNumber: 2, fromCardId: "card-2b" }, 2);
    expect((await open())?.correction).toMatchObject({ nextRevision: 3 });
  });

  it("the latest version has no card, so the card is an older version's: not offered", async () => {
    start({ versionNumber: 4, fromVersionNumber: 2, fromCardId: "card-2" }, 1);
    expect((await open())?.correction).toBeUndefined();
  });

  it("a first card, nothing to correct: not offered", async () => {
    start({ versionNumber: 1, fromVersionNumber: null, fromCardId: null });
    expect((await open())?.correction).toBeUndefined();
  });
});

describe("a version and its revision are named the way the spec shows them", () => {
  it("revision 1 is just the version; later ones say the revision", async () => {
    const { versionLabel } = await import("@/domain/cardVersions");
    expect(versionLabel(1, 1)).toBe("Version 1");
    expect(versionLabel(1, 2)).toBe("Version 1, revision 2");
    expect(versionLabel(3, undefined)).toBe("Version 3");
  });
});

describe("the card page names its revision, why it was corrected and whether it is current", () => {
  it("heads the card with the version, adding the revision above 1", async () => {
    const { cardHeading } = await import("@/domain/cardVersions");
    expect(cardHeading(1, 1)).toBe("AI card v1");
    expect(cardHeading(1, undefined)).toBe("AI card v1");
    expect(cardHeading(1, 2)).toBe("Version 1, revision 2");
  });

  it("an older card reads as kept as it was, naming its revision", async () => {
    const { keptNotice } = await import("@/domain/cardVersions");
    expect(keptNotice(1, 1)).toBe(
      "Version 1, revision 1, kept as it was: only the latest card changes.",
    );
    expect(keptNotice(2, 3)).toBe(
      "Version 2, revision 3, kept as it was: only the latest card changes.",
    );
  });

  it("says why and at whose request, and never prints a missing value", async () => {
    const { amendmentText } = await import("@/domain/cardVersions");
    expect(amendmentText("Provider name was wrong", "Eindhoven Engine")).toBe(
      "Corrected: Provider name was wrong. Requested by Eindhoven Engine.",
    );
    expect(amendmentText(null, "Eindhoven Engine")).toBe(
      "Corrected. Requested by Eindhoven Engine.",
    );
    expect(amendmentText("Typo", null)).toBe("Corrected: Typo.");
    expect(amendmentText(null, "  ")).toBe("Corrected.");
  });

  it("the card page uses them where it prints the version and the read-only notice", () => {
    const page = readFileSync(
      join(__dirname, "..", "..", "src/app/p/[project]/qualify/[id]/page.tsx"),
      "utf8",
    );
    expect(page).toContain("cardHeading(standing.versionNumber, q.revision)");
    expect(page).toContain("keptNotice(standing?.versionNumber || 0, q.revision)");
    expect(page).toContain("amendmentText(q.amendReason, q.amendRequestedBy)");
  });
});
