import { beforeEach, describe, expect, it, vi } from "vitest";

// GET .../ai-card.pdf renders the card's graph to a PDF and records the download in the
// ledger as card.pdf_downloaded, with the format the person asked for. system-card.pdf is
// the former name of the same route, and is recorded under its own name.

const m = vi.hoisted(() => ({
  emitEvent: vi.fn(async () => null),
  renderPdf: vi.fn(async () => new TextEncoder().encode("%PDF-1.7").buffer),
  build: vi.fn(async () => ({ view: { rows: [], chains: [] } })),
  cardSummary: vi.fn(async (id: string) =>
    id === "c1" ? { id: "c1", systemName: "MCAS", systemVersion: "1.2.0" } : null,
  ),
}));

vi.mock("@/lib/projectDb", () => ({ projectDbForRoute: async () => ({}) }));
vi.mock("@/server/repositories/QualificationRepository", () => ({
  QualificationRepository: class {
    cardSummary = m.cardSummary;
    transaction(fn: (r: unknown, tx: unknown) => unknown) {
      return Promise.resolve(fn(this, {}));
    }
  },
}));
vi.mock("@/vendor/aisc-ledger/emit", () => ({ emitEvent: m.emitEvent }));
vi.mock("@/server/services/OntologyService", () => ({ ontologyService: { build: m.build } }));
vi.mock("@/server/services/SystemCardRendererClient", async (orig) => ({
  ...(await orig<typeof import("@/server/services/SystemCardRendererClient")>()),
  systemCardRendererClient: { renderPdf: m.renderPdf },
}));
vi.mock("@/domain/SystemCard", async (orig) => ({
  ...(await orig<typeof import("@/domain/SystemCard")>()),
  systemCardPayload: () => ({}),
}));

const P = "a1b2c3d4-0000-4000-8000-000000000002";

async function get(file: "ai-card.pdf" | "system-card.pdf", id = "c1") {
  const { GET } =
    file === "ai-card.pdf"
      ? await import("@/app/p/[project]/api/qualifications/[id]/ai-card.pdf/route")
      : await import("@/app/p/[project]/api/qualifications/[id]/system-card.pdf/route");
  return GET(new Request(`http://app/p/${P}/api/qualifications/${id}/${file}`), {
    params: Promise.resolve({ project: P, id }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the AI card PDF download", () => {
  it.each(["ai-card.pdf", "system-card.pdf"] as const)(
    "%s answers the PDF, inline, named after the system, never cached",
    async (file) => {
      const res = await get(file);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/pdf");
      expect(res.headers.get("Content-Disposition")).toBe(
        'inline; filename="mcas_v1.2.0_ai_card.pdf"',
      );
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(new TextDecoder().decode(await res.arrayBuffer())).toBe("%PDF-1.7");
    },
  );

  it.each(["ai-card.pdf", "system-card.pdf"] as const)(
    "%s is recorded as card.pdf_downloaded with its own format",
    async (file) => {
      await get(file);
      expect(m.emitEvent).toHaveBeenCalledTimes(1);
      expect(m.emitEvent).toHaveBeenCalledWith(
        {},
        {
          action: "card.pdf_downloaded",
          itemType: "qualification",
          itemId: "c1",
          details: { format: file },
        },
      );
    },
  );

  it("a card the project does not have is 404 and records nothing", async () => {
    const res = await get("ai-card.pdf", "missing");
    expect(res.status).toBe(404);
    expect(m.emitEvent).not.toHaveBeenCalled();
  });
});
