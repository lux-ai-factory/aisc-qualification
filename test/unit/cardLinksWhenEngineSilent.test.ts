import { describe, it, expect, vi } from "vitest";
import { QualificationService } from "@/server/services/QualificationService";
import { FormValidationError } from "@/server/forms/QualificationFormParser";
import { defaultVersionLiteral } from "../support/forms";
import { transactional } from "../support/ledgerRepo";

// A card links the engine's components. A correction is a full copy of the card it corrects, its
// component links included; a save never stores a card with no links just because the engine did
// not answer.

const version = (number: number, cardRevision = 1) => ({
  pid: `v${number}`,
  number,
  project_id: "core-project-1",
  name: "Acme Vision",
  version: "1.0",
  provider: null,
  description: null,
  created_at: "2026-09-25T09:00:00Z",
  created_by: null,
  cardRevision,
});

const parsed = () => ({
  systemName: "Acme Vision",
  systemVersion: "1.0",
  company: "Acme Corp",
  description: "A vision system.",
  targetUseCase: "",
  targetUsers: "",
  intendedDeployers: null,
  targetSystemTags: [],
  sectorTags: [],
  marketFormTags: [],
  localityTags: [],
  answers: [],
  risks: [],
  systemComponents: [],
});

const LINK = {
  id: "cc-1",
  qualificationId: "card-1",
  componentPid: "11111111-1111-4111-8111-111111111111",
  airoProperty: "hasModel",
  name: "Back-end model",
  componentType: "llm",
  objectName: "model.json",
  linkedAt: new Date("2026-11-05T10:00:00Z"),
  componentKey: null,
};

function setup() {
  const platform = {
    createVersion: vi.fn(async () => version(2)),
    abandonVersion: vi.fn(async () => "abandoned"),
    reviseVersion: vi.fn(async () => version(1, 2)),
    listVersions: vi.fn(async () => [version(1)]),
    syncTargets: vi.fn(async () => undefined),
  };
  const repo = transactional({
    transaction: async (fn: (r: unknown, t: unknown) => unknown) => fn(repo, { $executeRaw: vi.fn(async () => 1) }),
    create: vi.fn(async () => ({ id: "card-1b" })),
    cardRefs: vi.fn(async () => [{ id: "card-1", systemId: "v1", revision: 1 }]),
    find: vi.fn(async (id: string) =>
      id === "card-1"
        ? {
            id: "card-1",
            systemId: "v1",
            revision: 1,
            answers: [],
            risks: [],
            systemComponents: [],
            components: [LINK],
            questionnaireVersionId: null,
          }
        : null,
    ),
  });
  const parser = { parse: vi.fn(() => parsed()) };
  const formsFor = vi.fn(async () => ({ resolve: vi.fn(async () => defaultVersionLiteral()) }));
  const review = { reviewToCarry: vi.fn(async () => ({ patch: null, extracted: null, carried: [], left: [], draft: "none" })) };
  const engine = {
    components: vi.fn(async () => {
      throw new Error("engine did not answer");
    }),
  };
  const svc = new (QualificationService as unknown as new (...a: unknown[]) => QualificationService)(
    repo, parser, platform, formsFor, review, engine,
  );
  return { svc, repo, platform };
}

const posted = () => {
  const fd = new FormData();
  fd.set("amendsId", "card-1");
  return fd;
};

describe("component links when the engine does not answer", () => {
  it("a correction keeps the component links of the card it corrects", async () => {
    const { svc, repo } = setup();
    await svc.reviseFromForm("mcas", posted(), { reason: "Typo", requestedBy: "Acme" });
    const input = (repo.create.mock.calls[0] as unknown[])[0] as { engineLinks?: unknown[] };
    expect(input.engineLinks).toEqual([
      expect.objectContaining({
        componentPid: LINK.componentPid,
        airoProperty: LINK.airoProperty,
        name: LINK.name,
        componentType: LINK.componentType,
        objectName: LINK.objectName,
      }),
    ]);
  });

  it("a save is refused with a message instead of storing a card with no links", async () => {
    const { svc, repo, platform } = setup();
    const err = await svc.createFromForm("mcas", new FormData()).catch((e) => e);
    expect(err).toBeInstanceOf(FormValidationError);
    expect(repo.create).not.toHaveBeenCalled();
    expect(platform.createVersion).not.toHaveBeenCalled();
  });
});
