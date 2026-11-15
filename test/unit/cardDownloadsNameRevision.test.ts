import { beforeEach, describe, expect, it, vi } from "vitest";

// A corrected card has two revisions of the same version. Their PDF and JSON downloads must say
// which version and revision they are, and whether a later revision replaced them, and must
// download under different names: "v1.2" for version 1, revision 2.

const V1 = {
  pid: "v1",
  number: 1,
  project_id: "core-project-1",
  name: "Mijke",
  version: "Pre-production",
  provider: null,
  description: null,
  created_at: "2026-10-28T09:00:00Z",
  created_by: null,
  cardRevision: 2,
};

const card = (id: string, revision: number) => ({
  id,
  systemId: "v1",
  revision,
  systemName: "Mijke the Matchbot",
  systemVersion: "Pre-production",
  company: "Acme",
  description: "A matchbot.",
  targetUseCase: "",
  targetUsers: "",
  targetSystemTags: [],
  sectorTags: [],
  questionnaireVersionId: null,
});

const m = vi.hoisted(() => ({
  renderPdf: vi.fn(async () => new TextEncoder().encode("%PDF-1.7").buffer),
  build: vi.fn(async () => ({ view: { rows: [], chains: [] }, jsonld: "{}", problems: [] })),
}));

vi.mock("@/lib/projectDb", () => ({ projectDbForRoute: async () => ({}) }));
vi.mock("@/server/repositories/QualificationRepository", () => ({
  QualificationRepository: class {
    cardSummary = async (id: string) => (id === "rev1" ? card("rev1", 1) : id === "rev2" ? card("rev2", 2) : null);
    find = this.cardSummary;
    cardRefs = async () => [
      { id: "rev1", systemId: "v1", revision: 1 },
      { id: "rev2", systemId: "v1", revision: 2 },
    ];
    transaction(fn: (r: unknown, tx: unknown) => unknown) {
      return Promise.resolve(fn(this, {}));
    }
  },
}));
vi.mock("@/vendor/aisc-ledger/emit", () => ({ emitEvent: vi.fn(async () => null) }));
vi.mock("@/server/services/OntologyService", () => ({ ontologyService: { build: m.build } }));
vi.mock("@/server/services/SystemCardRendererClient", async (orig) => ({
  ...(await orig<typeof import("@/server/services/SystemCardRendererClient")>()),
  systemCardRendererClient: { renderPdf: m.renderPdf },
}));
vi.mock("@/server/services/PlatformClient", async (orig) => ({
  ...(await orig<typeof import("@/server/services/PlatformClient")>()),
  platformClient: {
    listVersions: async () => [V1],
    latestVersion: async () => V1,
  },
}));

const P = "a1b2c3d4-0000-4000-8000-000000000002";

async function pdf(id: string) {
  const { GET } = await import("@/app/p/[project]/api/qualifications/[id]/ai-card.pdf/route");
  const res = await GET(new Request(`http://app/p/${P}/api/qualifications/${id}/ai-card.pdf`), {
    params: Promise.resolve({ project: P, id }),
  });
  const payload = (m.renderPdf.mock.calls.at(-1) as unknown[] | undefined)?.[0] as Record<string, unknown>;
  return { res, payload };
}

async function json(id: string) {
  const { GET } = await import("@/app/p/[project]/api/qualifications/[id]/ai-card.json/route");
  const res = await GET(new Request(`http://app/p/${P}/api/qualifications/${id}/ai-card.json`), {
    params: Promise.resolve({ project: P, id }),
  });
  return { res, body: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the downloads of a corrected card name their version and revision", () => {
  it("two revisions of one version download as two PDF file names, the second with v1.2", async () => {
    const one = (await pdf("rev1")).res.headers.get("Content-Disposition");
    const two = (await pdf("rev2")).res.headers.get("Content-Disposition");
    expect(one).not.toBe(two);
    expect(two).toMatch(/v1\.2/);
  });

  it("the PDF payload carries the card version and revision", async () => {
    const { payload } = await pdf("rev2");
    expect(payload).toMatchObject({ card_version: 1, card_revision: 2, superseded: false });
  });

  it("the PDF payload of a replaced revision says it was superseded", async () => {
    const { payload } = await pdf("rev1");
    expect(payload).toMatchObject({ card_version: 1, card_revision: 1, superseded: true });
  });

  it("the JSON export carries version, revision and superseded, and is named by revision", async () => {
    const { res, body } = await json("rev1");
    expect(body).toMatchObject({ card_version: 1, card_revision: 1, superseded: true });
    const two = (await json("rev2")).res.headers.get("Content-Disposition");
    expect(res.headers.get("Content-Disposition")).not.toBe(two);
  });
});
