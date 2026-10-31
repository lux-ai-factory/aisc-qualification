import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// With no card to show, the AI system page opens the empty form rather than a
// page that only says so. Only a platform that does not answer
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
vi.mock("@/server/services/QualificationService", () => ({
  qualificationService: svc,
}));
const engine = vi.hoisted(() => ({ components: vi.fn() }));
vi.mock("@/server/services/EngineClient", () => ({ engineClient: engine }));

const P = "a1b2c3d4-0000-4000-8000-000000000002";
async function open() {
  const { default: SystemPage } = await import("@/app/p/[project]/system/page");
  return SystemPage({ params: Promise.resolve({ project: P }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  engine.components.mockResolvedValue([]);
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

describe("the AI system page with a card", () => {
  const scorer = {
    pid: "m1",
    name: "Scorer",
    component_type: "model",
    data: "models/m.pkl",
  };
  const card = {
    id: "c3",
    systemName: "MCAS",
    components: [
      {
        componentPid: "m1",
        airoProperty: "hasModel",
        name: "Scorer",
        componentType: "model",
        objectName: "models/m.pkl",
      },
    ],
  };

  beforeEach(() => {
    svc.versions.mockResolvedValue([{ pid: "v3", number: 3 }]);
    svc.currentCardId.mockResolvedValue("c3");
    svc.get.mockResolvedValue(card);
  });

  it("opens the card when the engine has what the card links", async () => {
    engine.components.mockResolvedValue([scorer]);
    await expect(open()).rejects.toThrow(`REDIRECT /p/${P}/qualify/c3`);
  });

  it("lists what changed when the engine no longer matches the card", async () => {
    engine.components.mockResolvedValue([
      { pid: "d1", name: "Holdout", component_type: "dataset", data: "data/h.csv" },
    ]);
    const html = renderToStaticMarkup(await open());
    expect(html).toContain("removed: Scorer");
    expect(html).toContain("added: Holdout");
    expect(html).toContain(`/p/${P}/system/edit`);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("opens the card when the engine does not answer, claiming no drift", async () => {
    engine.components.mockRejectedValue(new Error("The engine did not answer"));
    await expect(open()).rejects.toThrow(`REDIRECT /p/${P}/qualify/c3`);
  });
});
