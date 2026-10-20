// The card page's qualification.opened event, from a real render of the page. The page reads
// the card, asks where it stands among the versions (the platform's list,
// the project's cards), and records which card version was opened and whether it was read-only.
// A server action re-renders the page in its own POST: that is the action, not an opening.
import { beforeEach, describe, expect, it, vi } from "vitest";

const PROJECT = "a1b2c3d4-0000-4000-8000-000000000002";
const m = vi.hoisted(() => ({
  emitEvent: vi.fn(async () => null),
  serverAction: false,
  listVersions: vi.fn(),
}));

const version = (n: number) => ({
  pid: `v${n}`,
  project_id: "a1b2c3d4-0000-4000-8000-000000000002",
  number: n,
  name: "MCAS",
  version: "provider text 1.2.0",
  provider: null,
  description: null,
  created_at: "2026-09-23T10:00:00Z",
  created_by: "u",
});
const card = (id: string, systemId: string) => ({
  id,
  systemId,
  systemName: "MCAS",
  systemVersion: "provider text 1.2.0",
  company: "L",
  description: "d",
  targetUseCase: "u",
  targetUsers: "t",
  intendedDeployers: null,
  targetSystemTags: [],
  sectorTags: [],
  marketFormTags: [],
  localityTags: [],
  questionnaireVersionId: null,
  createdAt: new Date("2026-09-23T10:00:00Z"),
  answers: [],
  risks: [],
  systemComponents: [],
});
const CARDS: Record<string, ReturnType<typeof card>> = {
  c2: card("c2", "v2"),
  c3: card("c3", "v3"),
};
const repo = {
  find: vi.fn(async (id: string) => CARDS[id] ?? null),
  cardRefs: vi.fn(async () => [
    { id: "c3", systemId: "v3" },
    { id: "c2", systemId: "v2" },
  ]),
  transaction: vi.fn(async (fn: (r: unknown, tx: unknown) => unknown) =>
    fn(repo, {}),
  ),
};

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/vendor/aisc-ledger/emit", async (orig) => ({
  ...(await orig<typeof import("@/vendor/aisc-ledger/emit")>()),
  emitEvent: m.emitEvent,
  isServerAction: async () => m.serverAction,
}));
vi.mock("@/server/repositories/QualificationRepository", () => ({
  QualificationRepository: class {},
  repositoryFor: async () => repo,
}));
vi.mock("@/server/services/PlatformClient", () => ({
  PlatformClient: class {},
  platformClient: { listVersions: m.listVersions },
}));
vi.mock("@/server/services/OntologyService", () => ({
  ontologyService: {
    build: async () => Promise.reject(new Error("no sidecar here")),
  },
}));
vi.mock("@/server/services/QuestionnaireService", () => ({
  questionnairesFor: async () => ({
    resolve: async () => null,
    latestVersion: async () => null,
  }),
  questionnaireResolverFor: async () => ({ resolve: async () => null }),
}));

const open = async (id: string) => {
  const Page = (await import("@/app/p/[project]/qualify/[id]/page")).default;
  await Page({ params: Promise.resolve({ project: PROJECT, id }) });
};
const opened = () =>
  m.emitEvent.mock.calls.map(
    (c) =>
      (c as unknown[])[1] as {
        action: string;
        itemId: string;
        details: unknown;
      },
  );

beforeEach(() => {
  vi.clearAllMocks();
  m.serverAction = false;
  m.listVersions.mockResolvedValue([version(3), version(2)]);
});

describe("qualification.opened, from the card page", () => {
  it("the latest card (v3) records version 3, not read-only", async () => {
    await open("c3");
    expect(opened()).toEqual([
      {
        action: "qualification.opened",
        itemType: "qualification",
        itemId: "c3",
        details: { version: 3, read_only: false },
      },
    ]);
  }, 30_000);

  it("an older card (v2) records its own version, read-only", async () => {
    await open("c2");
    expect(opened().map((e) => [e.itemId, e.details])).toEqual([
      ["c2", { version: 2, read_only: true }],
    ]);
  }, 30_000);

  it("when the platform cannot say, the version is null and the card is read-only", async () => {
    m.listVersions.mockRejectedValue(new Error("platform down"));
    await open("c3");
    expect(opened().map((e) => e.details)).toEqual([
      { version: null, read_only: true },
    ]);
  }, 30_000);

  it("a server action's re-render records no opening", async () => {
    m.serverAction = true;
    await open("c3");
    expect(m.emitEvent).not.toHaveBeenCalled();
  }, 30_000);
});
