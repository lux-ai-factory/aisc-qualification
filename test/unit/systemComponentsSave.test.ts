import { describe, it, expect, vi } from "vitest";
import { QualificationService } from "@/server/services/QualificationService";
import { FormValidationError } from "@/server/forms/QualificationFormParser";
import { toExport } from "@/server/services/QualificationExporter";
import { defaultVersionLiteral } from "../support/forms";

// Saving the Components block (targets plan v2, QL2 and QL5 input): keys come from the card the
// save starts from, never from the browser; the graph builder gets the rows and the links' parts.

const version = (number: number) => ({
  pid: `v${number}`, number, project_id: "core-project-1", name: "MCAS", version: "1.2.0",
  provider: null, description: null, created_at: "2026-09-29T09:00:00Z", created_by: null,
});

const row = (key: string | null, name: string, kind = "model") =>
  ({ position: 0, key, name, role: null, kind, provider: "in_house", providerName: null });

function setup(posted: unknown[], cards: unknown[]) {
  const platform = {
    createVersion: vi.fn(async () => version(2)),
    listVersions: vi.fn(async () => [version(1)]),
    syncTargets: vi.fn(async () => undefined),
  };
  const repo = { create: vi.fn(async () => ({ id: "card-2" })), list: vi.fn(async () => cards) };
  const parser = {
    parse: vi.fn(() => ({
      systemName: "MCAS", systemVersion: "1.2.0", company: "LIST", description: "", targetUseCase: "",
      targetUsers: "", intendedDeployers: null, targetSystemTags: [], sectorTags: [], marketFormTags: [],
      localityTags: [], answers: [], risks: [], systemComponents: posted, formVersionId: "annex-iv-default-v1",
    })),
  };
  const forms = { resolve: vi.fn(async () => defaultVersionLiteral()) };
  const svc = new (QualificationService as unknown as new (...a: unknown[]) => QualificationService)(
    repo, parser, platform, async () => forms,
  );
  return { svc, repo, platform };
}

const card1 = { id: "card-1", systemId: "v1", systemComponents: [{ ...row("11111111-1111-4111-8111-111111111111", "Scoring model"), qualificationId: "card-1", id: "c1" }] };

describe("QL2 a save keeps the keys of the card it starts from", () => {
  it("a carried row keeps its key; a new row gets a fresh uuid", async () => {
    const { svc, repo } = setup([row("11111111-1111-4111-8111-111111111111", "Scoring model"), row(null, "Training data", "training_data")], [card1]);
    await svc.createFromForm("p", new FormData());
    const saved = (repo.create.mock.calls[0] as unknown as [{ systemComponents: { key: string; name: string }[] }])[0].systemComponents;
    expect(saved[0].key).toBe("11111111-1111-4111-8111-111111111111");
    expect(saved[1].key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("a key that is not on the card before is refused, and nothing is saved", async () => {
    const { svc, repo, platform } = setup([row("22222222-2222-4222-8222-222222222222", "Forged")], [card1]);
    await expect(svc.createFromForm("p", new FormData())).rejects.toBeInstanceOf(FormValidationError);
    expect(repo.create).not.toHaveBeenCalled();
    expect(platform.createVersion).not.toHaveBeenCalled();
  });

  it("the first card has no card before: every row is new", async () => {
    const { svc, repo } = setup([row(null, "Scoring model")], []);
    await svc.createFromForm("p", new FormData());
    const saved = (repo.create.mock.calls[0] as unknown as [{ systemComponents: { key: string }[] }])[0].systemComponents;
    expect(saved[0].key).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("QL8 the platform is told the targets may have changed, and a failure never fails the save", () => {
  it("after the card is saved", async () => {
    const { svc, platform } = setup([row(null, "Scoring model")], []);
    await svc.createFromForm("p", new FormData());
    expect(platform.syncTargets).toHaveBeenCalledWith("p");
  });

  it("an unreachable platform still leaves the card saved", async () => {
    const { svc, platform, repo } = setup([row(null, "Scoring model")], []);
    platform.syncTargets.mockRejectedValueOnce(new Error("down"));
    await expect(svc.createFromForm("p", new FormData())).resolves.toEqual(expect.objectContaining({ id: "card-2" }));
    expect(repo.create).toHaveBeenCalled();
  });
});

describe("QL5 the graph builder gets the rows and which part each linked item is", () => {
  const base = {
    id: "q1", systemName: "MCAS", systemVersion: "1.2.0", company: "LIST", description: "", targetUseCase: "",
    targetUsers: "", intendedDeployers: null, targetSystemTags: [], sectorTags: [], marketFormTags: [],
    localityTags: [], answers: [], risks: [], components: [], systemComponents: [],
  };

  it("a card without rows exports as it always did", () => {
    expect(toExport(base as never)).not.toHaveProperty("systemComponents");
  });

  it("rows in order, and a link's part", () => {
    const out = toExport({
      ...base,
      systemComponents: [
        { id: "c2", qualificationId: "q1", position: 1, key: "k-2", name: "Training data", role: null, kind: "training_data", provider: "in_house", providerName: null },
        { id: "c1", qualificationId: "q1", position: 0, key: "k-1", name: "Scoring model", role: "Scores", kind: "model", vairType: "DecisionTree", provider: "in_house", providerName: null },
      ],
      components: [{ id: "l1", qualificationId: "q1", componentPid: "p-1", airoProperty: "hasTrainingData", name: "train.parquet",
                     componentType: "dataset", objectName: "train.parquet", linkedAt: new Date(), componentKey: "k-2" }],
    } as never);
    expect(out.systemComponents).toEqual([
      { key: "k-1", name: "Scoring model", role: "Scores", kind: "model", vairType: "DecisionTree", provider: "in_house", providerName: null },
      { key: "k-2", name: "Training data", role: null, kind: "training_data", vairType: null, provider: "in_house", providerName: null },
    ]);
    expect(out.engineComponents?.[0]).toEqual(expect.objectContaining({ pid: "p-1", componentKey: "k-2" }));
  });
});
