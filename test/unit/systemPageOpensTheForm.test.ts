import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// With no card to show, the AI system page opens the empty form rather than a
// page that only says so (2026-09-30). Only a platform that does not answer
// still gets a page of its own: there is nothing to open then.

const redirect = vi.fn((to: string) => {
  throw new Error(`REDIRECT ${to}`);
});
const svc = {
  versions: vi.fn(),
  currentCardId: vi.fn(),
  get: vi.fn(),
};
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
vi.mock("@/server/services/QualificationService", () => ({ qualificationService: svc }));
vi.mock("@/server/services/EngineClient", () => ({ engineClient: { components: vi.fn(async () => []) } }));

const P = "a1b2c3d4-0000-4000-8000-000000000002";
async function open() {
  const { default: SystemPage } = await import("@/app/p/[project]/system/page");
  return SystemPage({ params: Promise.resolve({ project: P }) });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the AI system page with no card", () => {
  it("opens the empty form when the latest version has no card", async () => {
    svc.versions.mockResolvedValue([{ pid: "v1", number: 1 }]);
    svc.currentCardId.mockResolvedValue(null);
    await expect(open()).rejects.toThrow(`REDIRECT /p/${P}/system/edit`);
  });

  it("opens the empty form when there is no version at all", async () => {
    svc.versions.mockResolvedValue([]);
    await expect(open()).rejects.toThrow(`REDIRECT /p/${P}/system/edit`);
  });

  it("still says so when the platform did not answer", async () => {
    svc.versions.mockRejectedValue(new Error("down"));
    const page = await open();
    expect(renderToStaticMarkup(page)).toMatch(/platform did not answer/);
    expect(redirect).not.toHaveBeenCalled();
  });
});
