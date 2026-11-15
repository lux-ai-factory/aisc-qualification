// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { cleanup, render } from "@testing-library/react";

// A correction of the AI card names who made it, as the first card of a version names who saved
// it: the card row keeps its author, and the versions list says "corrected by" that person.

const m = vi.hoisted(() => ({
  qualificationService: {
    createFromForm: vi.fn(),
    reviseFromForm: vi.fn(async () => ({ id: "card-1b" })),
    list: vi.fn(),
    versions: vi.fn(),
  },
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: m.redirect, notFound: vi.fn() }));
vi.mock("@/lib/projectDb", () => ({
  projectDbForAction: async () => ({ db: {} }),
  projectDbPastDoor: async () => ({}),
}));
vi.mock("@/vendor/aisc-ledger/emit", () => ({ emitEvent: vi.fn() }));
vi.mock("@/server/access/callerName", () => ({ callerName: async () => "Ada Lovelace" }));
vi.mock("@/server/services/QualificationService", () => ({
  QualificationService: class {},
  qualificationService: m.qualificationService,
}));

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

function find(node: ReactNode, name: string): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((n) => find(n, name));
  if (!isValidElement(node)) return [];
  const el = node as ReactElement<Record<string, unknown>>;
  const type = el.type as { name?: string } | string;
  const here = typeof type !== "string" && type?.name === name ? [el] : [];
  return [...here, ...find(el.props.children as ReactNode, name)];
}

describe("the author of a card revision", () => {
  it("the card table keeps who made a correction", () => {
    const schema = readFileSync(join(__dirname, "../../prisma/schema.prisma"), "utf8");
    const model = schema.slice(schema.indexOf("model Qualification {"));
    expect(model.slice(0, model.indexOf("\n}"))).toMatch(/@map\("amended_by"\)/);
  });

  it("a correction passes the caller's name with its reason and requester", async () => {
    const { submitQualification } = await import("@/app/p/[project]/qualify/new/actions");
    const fd = new FormData();
    fd.set("change", "correction");
    fd.set("amendsId", "card-1");
    fd.set("amendReason", "Provider name was wrong");
    fd.set("amendRequestedBy", "Eindhoven, email of 10 Nov");
    await submitQualification("mijke", undefined, fd).catch(() => undefined);
    expect(m.qualificationService.reviseFromForm).toHaveBeenCalledWith(
      "mijke",
      expect.anything(),
      expect.objectContaining({ amendedBy: "Ada Lovelace" }),
      expect.anything(),
    );
  });

  it("the versions list says who corrected a revision", async () => {
    const at = new Date("2026-11-11T21:56:00Z");
    m.qualificationService.list.mockResolvedValue([
      {
        id: "card-1b",
        systemId: "v1",
        revision: 2,
        amendReason: "Provider name was wrong",
        amendRequestedBy: "Eindhoven",
        amendedBy: "Ada Lovelace",
        systemName: "Mijke",
        systemVersion: "Pre-production",
        company: "Acme",
        description: "A matchbot.",
        createdAt: at,
        answers: [],
        risks: [],
      },
    ]);
    m.qualificationService.versions.mockResolvedValue([
      { pid: "v1", number: 1, created_by: "Grace Hopper", cardRevision: 2 },
    ]);
    const Page = (await import("@/app/p/[project]/qualifications/page")).default;
    const tree = await Page({ params: Promise.resolve({ project: "mijke" }) } as never);
    const list = find(tree, "QualificationsList")[0];
    expect(list).toBeDefined();
    const List = list!.type as (p: unknown) => ReactElement;
    render(<List {...list!.props} />);
    expect(document.body.textContent).toMatch(/corrected by Ada Lovelace/);
  });
});
