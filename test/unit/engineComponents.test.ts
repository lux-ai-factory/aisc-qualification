import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The card's components link to the engine's real ones through AIRO (hasModel, hasTrainingData, hasTestingData,
// hasValidationData, hasComponent). The engine is read, never written: its
// components come from GET /api/v1/projects?platform_project_id=<pid>, then
// GET /api/v1/projects/{enginePid}/aisystem, with the caller's own token.
// Drift between the latest card's links and the engine is shown, not fixed.
//
// Modules are imported by a runtime path, so a missing one fails its tests
// rather than the whole file at collection. Under test: src/server/services/EngineClient.ts
// and src/domain/cardComponents.ts (defaultProperty, propertyOptions, componentDrift).

const ENGINE_CLIENT = "server/services/EngineClient.ts";
const CARD_COMPONENTS = "domain/cardComponents.ts";
// A runtime path under src/: an alias in a non-literal import is not resolved.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

function engine(fetchOverride?: typeof fetch) {
  const fetchImpl =
    fetchOverride ??
    vi.fn(async (url: string) => {
      if (url.includes("/api/v1/projects?platform_project_id=")) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ pid: ENGINE_PID, name: "P" }],
        };
      }
      if (url.endsWith(`/api/v1/projects/${ENGINE_PID}/aisystem`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            pid: "s",
            name: "",
            description: "",
            components,
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
  return fetchImpl as unknown as ReturnType<typeof vi.fn>;
}

describe("EngineClient (6b)", () => {
  it("S6.6 reads the engine project by platform pid, then its aisystem, with the caller's token", async () => {
    const { EngineClient } = await load(ENGINE_CLIENT);
    const fetchImpl = engine();
    const client = new EngineClient(
      "http://aisc-backend:8000",
      fetchImpl,
      async () => "caller-tok",
    );

    const found = await client.components(PLATFORM_PID);

    expect(found.map((c: { pid: string }) => c.pid)).toEqual(["m1", "d1"]);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      `http://aisc-backend:8000/api/v1/projects?platform_project_id=${PLATFORM_PID}`,
    );
    expect(fetchImpl.mock.calls[1][0]).toBe(
      `http://aisc-backend:8000/api/v1/projects/${ENGINE_PID}/aisystem`,
    );
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init.headers.Authorization).toBe("Bearer caller-tok");
    }
  });

  it("S6.6 a stranger (the engine lists no project for them) gets no components", async () => {
    const { EngineClient } = await load(ENGINE_CLIENT);
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [],
    }));
    const client = new EngineClient(
      "http://aisc-backend:8000",
      fetchImpl,
      async () => "stranger",
    );

    expect(await client.components(PLATFORM_PID)).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("S6.3 an unreachable engine says 'The engine did not answer'", async () => {
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

  it("S6.6 it uses AISC_BACKEND_URL by default and never writes to the engine", () => {
    const source = readFileSync("src/server/services/EngineClient.ts", "utf8");
    expect(source).toMatch(/AISC_BACKEND_URL/);
    expect(source).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)["']/);
  });
});

describe("the property select is pre-set by component_type (6b)", () => {
  it("S6.1 model and llm are hasModel; dataset is hasTestingData; datashape and resource are hasComponent", async () => {
    const { defaultProperty } = await load(CARD_COMPONENTS);
    expect(defaultProperty("model")).toBe("hasModel");
    expect(defaultProperty("llm")).toBe("hasModel");
    expect(defaultProperty("dataset")).toBe("hasTestingData");
    expect(defaultProperty("datashape")).toBe("hasComponent");
    expect(defaultProperty("resource")).toBe("hasComponent");
  });

  it("S6.1 a dataset is also offered as training or validation data", async () => {
    const { propertyOptions } = await load(CARD_COMPONENTS);
    expect(propertyOptions("dataset")).toEqual(
      expect.arrayContaining([
        "hasTestingData",
        "hasTrainingData",
        "hasValidationData",
      ]),
    );
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

  it("S6.2 no drift when the links match the engine", async () => {
    const { componentDrift } = await load(CARD_COMPONENTS);
    expect(componentDrift(linked, components)).toEqual({
      removed: [],
      added: [],
      changed: [],
    });
  });

  it("S6.2 a deleted engine component is 'removed'", async () => {
    const { componentDrift } = await load(CARD_COMPONENTS);
    const drift = componentDrift(linked, [components[0]]);
    expect(
      drift.removed.map((c: { componentPid: string }) => c.componentPid),
    ).toEqual(["d1"]);
    expect(drift.added).toEqual([]);
  });

  it("S6.2 a new engine component is 'added'", async () => {
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

  it("S6.2 a re-upload (same pid, other data or type) is 'changed'", async () => {
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

  it("S6.2 computing drift changes nothing it was given", async () => {
    const { componentDrift } = await load(CARD_COMPONENTS);
    const before = JSON.stringify([linked, components]);
    componentDrift(linked, [components[0]]);
    expect(JSON.stringify([linked, components])).toBe(before);
  });
});

describe("the export shape carries the linked components (6b)", () => {
  it("S6.1 toExport gains engineComponents from the card_component rows", async () => {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// A linked engine item may say which of the card's components it is;
// test material never is one.
import { partOfLink } from "@/domain/cardComponents";

describe("QL7 which part of the system a linked engine item is", () => {
  const keys = new Set(["k-train", "k-model"]);
  it("none is always fine", () => {
    expect(partOfLink("hasTestingData", null, keys)).toEqual({
      ok: true,
      componentKey: null,
    });
  });
  it("a component of this card", () => {
    expect(partOfLink("hasTrainingData", "k-train", keys)).toEqual({
      ok: true,
      componentKey: "k-train",
    });
  });
  it("not a component of this card", () => {
    expect(partOfLink("hasModel", "k-other", keys)).toEqual({
      ok: false,
      error: expect.stringMatching(/not on this card/),
    });
  });
  it("test material is not a part of the system", () => {
    expect(partOfLink("hasTestingData", "k-train", keys)).toEqual({
      ok: false,
      error: expect.stringMatching(/test/i),
    });
  });
});
