import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";

// When the platform does not answer, the card pages say so, and never say
// "no card" about a project that has cards: the versions list keeps a notice in
// place of the version numbers and does not offer to "Create the AI card"; the
// system page is headed as a page that cannot show the card right now, and a
// failed lookup of the current card is said rather than sent to the edit form.

const m = vi.hoisted(() => ({
  qualificationService: {
    list: vi.fn(),
    versions: vi.fn(),
    currentCardId: vi.fn(),
    get: vi.fn(),
  },
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: m.redirect, notFound: vi.fn() }));
vi.mock("@/server/services/QualificationService", () => ({
  QualificationService: class {},
  qualificationService: m.qualificationService,
}));
vi.mock("@/server/services/EngineClient", () => ({
  engineClient: { components: async () => null },
}));
vi.mock("@/app/p/[project]/qualifications/QualificationsList", () => ({
  default: function QualificationsList() {
    return null;
  },
}));

function elements(node: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  const el = node as ReactElement<Record<string, unknown>>;
  return [el, ...Object.values(el.props ?? {}).flatMap(elements)];
}
const text = (tree: unknown) =>
  elements(tree)
    .flatMap((e) => {
      const c = e.props?.children;
      return (Array.isArray(c) ? c : [c]).filter(
        (x) => typeof x === "string" || typeof x === "number",
      );
    })
    .join(" ");
const heading = (tree: unknown) =>
  elements(tree)
    .filter((e) => e.type === "h1")
    .map((e) =>
      typeof e.props.children === "string" ? e.props.children : text(e.props.children),
    )
    .join(" ");

const card = (id: string, systemId: string) => ({
  id,
  systemId,
  revision: 1,
  amendReason: null,
  amendRequestedBy: null,
  systemName: "MCAS",
  systemVersion: "1.2.0",
  company: "L",
  description: "d",
  createdAt: new Date("2026-09-23T10:00:00Z"),
  answers: [],
  risks: [],
  components: [],
});
const SILENT = new Error("the platform did not answer");

beforeEach(() => {
  vi.clearAllMocks();
  m.qualificationService.list.mockResolvedValue([card("c1", "v1"), card("c2", "v2")]);
});

async function versionsList() {
  const Page = (await import("@/app/p/[project]/qualifications/page")).default;
  return Page({ params: Promise.resolve({ project: "mcas" }) });
}
async function systemPage() {
  const Page = (await import("@/app/p/[project]/system/page")).default;
  return Page({ params: Promise.resolve({ project: "mcas" }) });
}

describe("the versions list when the platform does not answer", () => {
  it("does not offer to create the AI card of a project that has cards", async () => {
    m.qualificationService.versions.mockRejectedValue(SILENT);
    expect(text(await versionsList())).not.toMatch(/Create the AI card/);
  });

  it("says the version numbers cannot be shown", async () => {
    m.qualificationService.versions.mockRejectedValue(SILENT);
    expect(text(await versionsList())).toMatch(/did not answer/i);
  });
});

describe("the system page when the platform does not answer", () => {
  it("is not headed 'No AI card yet'", async () => {
    m.qualificationService.versions.mockRejectedValue(SILENT);
    expect(heading(await systemPage())).not.toMatch(/No AI card yet/);
  });

  it("a failed lookup of the current card is said, not sent to the edit form", async () => {
    m.qualificationService.versions.mockResolvedValue([{ pid: "v2", number: 2 }]);
    m.qualificationService.currentCardId.mockRejectedValue(SILENT);
    const out = await systemPage().catch((err: unknown) => String(err));
    expect(String(out), "the page sent the person to the edit form").not.toMatch(
      /NEXT_REDIRECT .*system\/edit/,
    );
    expect(heading(out)).toMatch(/cannot be shown/i);
  });
});
