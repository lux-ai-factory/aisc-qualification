import { describe, it, expect, vi, beforeEach } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";

// When the edit page offers to correct the description of the latest version, saving does not
// necessarily make a new version: the person chooses. The header and the prefilled notice then
// must not promise "Saving makes v2"; the version text belongs next to the choice.

const { questionnaireService, qualificationService } = vi.hoisted(() => ({
  questionnaireService: { latestVersion: vi.fn(), resolve: vi.fn(), chooserOptions: vi.fn() },
  qualificationService: { startingPoint: vi.fn() },
}));

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

const QV = {
  versionId: "acme-v1",
  questionnaireId: "acme",
  questionnaireName: "Acme AI policy",
  description: "",
  versionNumber: 1,
  listed: true,
  builtin: false,
  retired: false,
  blocks: [],
  questions: [],
};

function find(node: ReactNode, name: string): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((n) => find(n, name));
  if (!isValidElement(node)) return [];
  const el = node as ReactElement<Record<string, unknown>>;
  const type = el.type as { name?: string } | string;
  const here = typeof type !== "string" && type?.name === name ? [el] : [];
  return [...here, ...find(el.props.children as ReactNode, name)];
}

/** The text a tree of elements shows, without rendering components. */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

beforeEach(() => {
  vi.clearAllMocks();
  questionnaireService.latestVersion.mockResolvedValue(QV);
  questionnaireService.resolve.mockResolvedValue(QV);
  questionnaireService.chooserOptions.mockResolvedValue([]);
  // the latest card is version 1, revision 2: correcting it again makes revision 1.3
  qualificationService.startingPoint.mockResolvedValue({
    next: { versionNumber: 2, fromVersionNumber: 1, fromCardId: "card-1b" },
    initial: { systemName: "Mijke" },
    fromQuestionnaireVersionId: "acme-v1",
    fromRevision: 2,
  });
});

async function open() {
  const EditSystemPage = (await import("@/app/p/[project]/system/edit/page")).default;
  const tree = await EditSystemPage({
    params: Promise.resolve({ project: "mijke" }),
    searchParams: Promise.resolve({ questionnaire: "acme" }),
  } as never);
  return find(tree, "QualifyForm")[0]!.props;
}

describe("the edit page does not promise a new version when a correction is offered", () => {
  it("offers the correction of version 1", async () => {
    const form = await open();
    expect(form.correction).toMatchObject({ versionNumber: 1, nextRevision: 3 });
  });

  it("the header does not say saving makes v2", async () => {
    const form = await open();
    const header = textOf(form.header as ReactNode);
    expect(header).not.toMatch(/makes v2/);
  });
});
