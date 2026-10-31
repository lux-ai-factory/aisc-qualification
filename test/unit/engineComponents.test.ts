import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The card's components link to the engine's real ones through AIRO (hasModel for a model,
// hasComponent for every other type). The engine is read the way the platform reads it
// (platform/platform_service/engine_components.py): POST /api/v1/projects/for-platform/<pid> gives
// the engine's own project for this platform project, then GET /api/v1/projects/{enginePid}/aisystem
// lists its components. Both carry the caller's own token and X-AISC-Project, without which the
// engine answers 400 (apps/backend/aisc_backend/project_door.py).
// Drift between the latest card's links and the engine is shown, not fixed.
//
// Modules are imported by a runtime path, so a missing one fails its tests
// rather than the whole file at collection. Under test: src/server/services/EngineClient.ts
// and src/domain/cardComponents.ts (componentDrift).

const ENGINE_CLIENT = "server/services/EngineClient.ts";
const CARD_COMPONENTS = "domain/cardComponents.ts";
// A runtime path under src/: an alias in a non-literal import is not resolved.
const load = (path: string): Promise<any> =>
  import(/* @vite-ignore */ resolve("src", path));

const PLATFORM_PID = "a1b2c3d4-0000-4000-8000-000000000002";
const ENGINE_PID = "e0000000-0000-4000-8000-000000000009";
const components = [
  {
    pid: "m1",
    name: "Scorer",
    description: "",
    component_type: "model",
    data: "models/m.pkl",
    file_size: 10,
    json_value: null,
    source_dataset_pid: null,
  },
  {
    pid: "d1",
    name: "Holdout",
    description: "",
    component_type: "dataset",
    data: "data/h.csv",
    file_size: 20,
    json_value: null,
    source_dataset_pid: null,
  },
];

type Init = { method?: string; headers: Record<string, string>; signal?: AbortSignal };
const answer = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });

/**
 * A fake engine as strict as the real one: no X-AISC-Project is a 400, as the door answers, and the
 * project list's `platform_project_id` is refused because the real engine ignores it (it would list
 * every project the caller may see, not the one asked for). `forPlatform` is what the engine answers
 * to POST /api/v1/projects/for-platform/<pid>.
 */
function engine(forPlatform: { status: number; body?: unknown } = { status: 200, body: { pid: ENGINE_PID, name: "P" } }) {
  return vi.fn(async (url: string, init: Init) => {
    const method = init.method ?? "GET";
    if (!init.headers["X-AISC-Project"]) return answer(400, { detail: "name the project in X-AISC-Project" });
    if (url.includes("platform_project_id=")) return answer(400, { detail: "the engine ignores platform_project_id" });
    if (method === "POST" && url.endsWith(`/api/v1/projects/for-platform/${PLATFORM_PID}`)) {
      if (init.headers["X-AISC-Project"] !== PLATFORM_PID) return answer(404, { detail: "no such thing in this project" });
      return answer(forPlatform.status, forPlatform.body ?? { detail: "refused" });
    }
    if (method === "GET" && url.endsWith(`/api/v1/projects/${ENGINE_PID}/aisystem`)) {
      return answer(200, { pid: "s", name: "", description: "", components });
    }
    return answer(404, {});
  });
}

describe("EngineClient (6b)", () => {
  it("finds the engine's project for the platform pid, then reads its aisystem, with the caller's token and the project header", async () => {
    const { EngineClient } = await load(ENGINE_CLIENT);
    const fetchImpl = engine();
    const client = new EngineClient("http://aisc-backend:8000", fetchImpl, async () => "caller-tok");

    const found = await client.components(PLATFORM_PID);

    expect(found.map((c: { pid: string }) => c.pid)).toEqual(["m1", "d1"]);
    const [[firstUrl, first], [secondUrl, second]] = fetchImpl.mock.calls as [string, Init][];
    expect(firstUrl).toBe(`http://aisc-backend:8000/api/v1/projects/for-platform/${PLATFORM_PID}`);
    expect(first.method).toBe("POST");
    expect(secondUrl).toBe(`http://aisc-backend:8000/api/v1/projects/${ENGINE_PID}/aisystem`);
    expect(second.method ?? "GET").toBe("GET");
    for (const [, init] of fetchImpl.mock.calls as [string, Init][]) {
      expect(init.headers.Authorization).toBe("Bearer caller-tok");
      expect(init.headers["X-AISC-Project"]).toBe(PLATFORM_PID);
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it.each([
    [403, "a viewer (the engine's project takes an editor)"],
    [404, "a stranger (the engine says there is no such project)"],
  ])("the engine refusing with %i, %s, gives no components", async (status) => {
    const { EngineClient } = await load(ENGINE_CLIENT);
    const fetchImpl = engine({ status });
    const client = new EngineClient("http://aisc-backend:8000", fetchImpl, async () => "someone");

    expect(await client.components(PLATFORM_PID)).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("any other failure says what the engine answered", async () => {
    const { EngineClient } = await load(ENGINE_CLIENT);
    const client = new EngineClient("http://aisc-backend:8000", engine({ status: 500 }), async () => "t");
    await expect(client.components(PLATFORM_PID)).rejects.toThrow("The engine answered 500");
  });

  it("an unreachable engine says 'The engine did not answer'", async () => {
    const { EngineClient } = await load(ENGINE_CLIENT);
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const client = new EngineClient(
      "http://aisc-backend:8000",
      fetchImpl,
      async () => "t",
    );
    await expect(client.components(PLATFORM_PID)).rejects.toThrow(
      "The engine did not answer",
    );
  });

  it("an engine that does not answer in time says 'The engine did not answer'", async () => {
    const { EngineClient } = await load(ENGINE_CLIENT);
    const hanging = vi.fn(
      (_url: string, init: Init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const client = new EngineClient("http://aisc-backend:8000", hanging, async () => "t", 20);
    await expect(client.components(PLATFORM_PID)).rejects.toThrow("The engine did not answer");
  });

  it("it uses AISC_BACKEND_URL by default and writes nothing but the engine's own row for the project", () => {
    const source = readFileSync("src/server/services/EngineClient.ts", "utf8");
    expect(source).toMatch(/AISC_BACKEND_URL/);
    expect(source).not.toMatch(/["'](PUT|PATCH|DELETE)["']/);
    // the one POST is for-platform, which finds the engine's project (and makes it on an editor's first visit)
    const posts = [...source.matchAll(/["']POST["'],\s*`([^`]*)`/g)].map((m) => m[1]);
    expect(posts).toEqual(["/api/v1/projects/for-platform/${encodeURIComponent(platformProjectPid)}"]);
  });
});

describe("drift between the card's links and the engine (6c)", () => {
  const linked = [
    {
      componentPid: "m1",
      componentType: "model",
      objectName: "models/m.pkl",
      airoProperty: "hasModel",
      name: "Scorer",
    },
    {
      componentPid: "d1",
      componentType: "dataset",
      objectName: "data/h.csv",
      airoProperty: "hasTestingData",
      name: "Holdout",
    },
  ];

  it("no drift when the links match the engine", async () => {
    const { componentDrift } = await load(CARD_COMPONENTS);
    expect(componentDrift(linked, components)).toEqual({
      removed: [],
      added: [],
      changed: [],
    });
  });

  it("a deleted engine component is 'removed'", async () => {
    const { componentDrift } = await load(CARD_COMPONENTS);
    const drift = componentDrift(linked, [components[0]]);
    expect(
      drift.removed.map((c: { componentPid: string }) => c.componentPid),
    ).toEqual(["d1"]);
    expect(drift.added).toEqual([]);
  });

  it("a new engine component is 'added'", async () => {
    const { componentDrift } = await load(CARD_COMPONENTS);
    const extra = {
      ...components[0],
      pid: "r9",
      component_type: "resource",
      data: "r.bin",
    };
    const drift = componentDrift(linked, [...components, extra]);
    expect(drift.added.map((c: { pid: string }) => c.pid)).toEqual(["r9"]);
  });

  it("a re-upload (same pid, other data or type) is 'changed'", async () => {
    const { componentDrift } = await load(CARD_COMPONENTS);
    const reuploaded = [
      components[0],
      { ...components[1], data: "data/h-v2.csv" },
    ];
    const drift = componentDrift(linked, reuploaded);
    expect(
      drift.changed.map(
        (c: { pid?: string; componentPid?: string }) => c.pid ?? c.componentPid,
      ),
    ).toEqual(["d1"]);
    expect(drift.removed).toEqual([]);
    expect(drift.added).toEqual([]);
  });

  it("computing drift changes nothing it was given", async () => {
    const { componentDrift } = await load(CARD_COMPONENTS);
    const before = JSON.stringify([linked, components]);
    componentDrift(linked, [components[0]]);
    expect(JSON.stringify([linked, components])).toBe(before);
  });
});

describe("the export shape carries the linked components (6b)", () => {
  it("toExport gains engineComponents from the card_component rows", async () => {
    const { toExport } =
      await import("@/server/services/QualificationExporter");
    const q = {
      id: "q1",
      systemName: "MCAS",
      systemVersion: "1",
      company: "L",
      description: "d",
      targetUseCase: "u",
      targetUsers: "t",
      intendedDeployers: null,
      targetSystemTags: [],
      sectorTags: [],
      marketFormTags: [],
      localityTags: [],
      answers: [],
      risks: [],
      components: [
        {
          id: "cc1",
          qualificationId: "q1",
          componentPid: "m1",
          airoProperty: "hasModel",
          name: "Scorer",
          componentType: "model",
          objectName: "models/m.pkl",
          linkedAt: new Date(),
        },
      ],
    };
    const out = toExport(q as any) as any;
    expect(out.engineComponents).toEqual([
      {
        pid: "m1",
        name: "Scorer",
        componentType: "model",
        objectName: "models/m.pkl",
        property: "hasModel",
      },
    ]);
  });
});

describe("the links a save writes", () => {
  it("one per engine component, with its snapshot, by the AIRO property its type allows", async () => {
    const { engineLinks } = await load(CARD_COMPONENTS);
    const llm = { ...components[0], pid: "l1", name: "Chat", component_type: "llm", data: "gpt" };
    const shape = { ...components[1], pid: "a1", name: "Shape", component_type: "datashape", data: "" };
    expect(engineLinks([...components, llm, shape])).toEqual([
      // the engine does not say whether a dataset trains, tests or validates: only that it is a part
      { componentPid: "a1", airoProperty: "hasComponent", name: "Shape", componentType: "datashape", objectName: "", componentKey: null },
      { componentPid: "d1", airoProperty: "hasComponent", name: "Holdout", componentType: "dataset", objectName: "data/h.csv", componentKey: null },
      { componentPid: "l1", airoProperty: "hasModel", name: "Chat", componentType: "llm", objectName: "gpt", componentKey: null },
      { componentPid: "m1", airoProperty: "hasModel", name: "Scorer", componentType: "model", objectName: "models/m.pkl", componentKey: null },
    ]);
  });

  it("links made from the engine show no drift against it", async () => {
    const { engineLinks, componentDrift, hasDrift } = await load(CARD_COMPONENTS);
    expect(hasDrift(componentDrift(engineLinks(components), components))).toBe(false);
  });
});
