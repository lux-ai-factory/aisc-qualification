import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { annexDefaultVersion } from "@/domain/forms/legacy";

// The next card's content is compared and built before it is stored (what its review takes from
// the card before it): QualificationService's pendingCard. Its export must be the stored card's
// export, or the draft would be judged on content the card does not have. Two saves through the
// real repository on the throwaway of test/db/throwaway-db.sh; never the live DB.

const TEMPLATE = process.env.QUALIFICATION_TEST_PROJECT_DATABASE_URL ?? "";
const ADMIN_TEMPLATE = process.env.QUALIFICATION_TEST_PROJECT_ADMIN_URL ?? "";
// a project of its own (throwaway-db.sh): its versions would make another test's card not the latest
const E = process.env.QUALIFICATION_TEST_CARRY_PROJECT ?? "";
const enabled = TEMPLATE !== "" && ADMIN_TEMPLATE !== "" && !!E;
if (enabled && [TEMPLATE, ADMIN_TEMPLATE].some((u) => /:5432\//.test(u))) {
  throw new Error("refusing to run the DB tests against port 5432 (the live stack)");
}

vi.mock("@/vendor/aisc-ledger/emit", async (orig) => ({
  ...(await orig<typeof import("@/vendor/aisc-ledger/emit")>()),
  emitEvent: async () => null,
}));

const APP = resolve(__dirname, "..", "..");
const dbName = (pid: string) => `project_${pid.toLowerCase().replace(/-/g, "")}`;
const at = (template: string, database: string) => template.replace("{database}", database);

const V1 = "c0c0c0c0-2222-4000-8000-000000000101";
const V2 = "c0c0c0c0-2222-4000-8000-000000000102";
const V3 = "c0c0c0c0-2222-4000-8000-000000000103";
// The engine's components, as GET /api/v1/projects/{pid}/aisystem lists them: every save links them.
const ENGINE = [
  { pid: "e0e0e0e0-2222-4000-8000-000000000002", name: "Loans", component_type: "dataset", data: "data/loans.csv" },
  { pid: "e0e0e0e0-2222-4000-8000-000000000001", name: "Scorer", component_type: "model", data: "models/m.pkl" },
];
const engine = { components: async () => ENGINE };
let su: PrismaClient;
let app: PrismaClient;

beforeAll(async () => {
  if (!enabled) return;
  const run = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: APP,
    env: { ...process.env, DATABASE_URL: at(TEMPLATE, dbName(E)) },
    encoding: "utf8",
    timeout: 240_000,
  });
  if (run.status !== 0) throw new Error(`migrate deploy failed: ${(run.stdout + run.stderr).slice(-600)}`);
  su = new PrismaClient({ datasourceUrl: at(ADMIN_TEMPLATE, dbName(E)) });
  app = new PrismaClient({ datasourceUrl: at(TEMPLATE, dbName(E)) });
  await version(V1, 101);
}, 300_000);

/** A card version as the platform makes it: only the newest one's card may be written. */
async function version(pid: string, number: number) {
  await su.$executeRawUnsafe(
    `INSERT INTO project.system (pid, number, name) VALUES ('${pid}', ${number}, 'MCAS') ON CONFLICT DO NOTHING`,
  );
}

afterAll(async () => {
  await su?.$disconnect();
  await app?.$disconnect();
});

describe.skipIf(!enabled)("the next card's content, before it is stored", () => {
  it("exports as the stored card does", async () => {
    const { QualificationService } = await import("@/server/services/QualificationService");
    const { QualificationRepository } = await import("@/server/repositories/QualificationRepository");
    const { toExport } = await import("@/server/services/QualificationExporter");
    const form = annexDefaultVersion();
    const [first, second] = form.questions;
    const [toolA, questionA] = first.key.split(":");
    const [toolB, questionB] = second.key.split(":");
    const content = {
      systemName: "MCAS",
      systemVersion: "1.2.0",
      company: "LIST",
      description: "Scores loans",
      targetUseCase: "credit",
      targetUsers: "officers",
      intendedDeployers: null,
      systemType: null,
      purpose: null,
      providerTerm: null,
      deployerTerm: null,
      targetSystemTags: [],
      sectorTags: [],
      marketFormTags: [],
      localityTags: [],
      // posted in another order than the form's, as a browser may
      answers: [
        { toolId: toolB, questionId: questionB, answer: "second answer" },
        { toolId: toolA, questionId: questionA, answer: "first answer" },
      ],
      risks: [1, 0].map((position) => ({
        position,
        risk: `risk ${position}`,
        source: "s",
        sourceTerm: null,
        vulnerability: "v",
        consequence: "c",
        consequenceTerm: null,
        impactTerm: null,
        affected: "a",
        impactAreas: [],
        control: "k",
        controlTerm: null,
        followUpControl: "",
        followUpControlTerm: null,
      })),
      systemComponents: [1, 0].map((position) => ({
        position,
        key: null,
        name: `part ${position}`,
        role: null,
        kind: "model",
        vairType: null,
        provider: "in_house",
        providerName: null,
      })),
    };
    const repo = new QualificationRepository(app);
    let versions: { pid: string; number: number }[] = [];
    const seen: unknown[] = [];
    const service = (pid: string) =>
      new QualificationService(
        repo,
        { parse: () => ({ ...content, formVersionId: form.versionId }) } as never,
        {
          createVersion: async () => ({ pid, project_id: E }),
          listVersions: async () => versions,
          syncTargets: async () => undefined,
        } as never,
        async () => ({ resolve: async () => form }) as never,
        {
          reviewToCarry: async (_p: string, _from: unknown, next: unknown) => {
            seen.push(next);
            return { patch: null, extracted: null, carried: [], left: [], draft: "none" };
          },
        },
        engine as never,
      );

    const { id: before } = await service(V1).createFromForm(E, new FormData());
    expect(seen).toEqual([]); // a first card: nothing to carry
    versions = [{ pid: V1, number: 101 }];
    await version(V2, 102);
    const { id: made } = await service(V2).createFromForm(E, new FormData());

    const stored = toExport((await repo.find(made))!, form);
    const { id: _pendingId, ...pending } = seen[0] as Record<string, unknown>;
    const { id: storedId, ...saved } = stored as unknown as Record<string, unknown>;
    void _pendingId;
    expect(storedId).toBe(made);
    expect(made).not.toBe(before);
    expect(pending).toEqual(saved);
    expect((saved as { engineComponents?: unknown[] }).engineComponents).toHaveLength(2);
  });

  it("every save links the engine's components, with their snapshot, so the system page sees no drift", async () => {
    const { QualificationService } = await import("@/server/services/QualificationService");
    const { QualificationRepository } = await import("@/server/repositories/QualificationRepository");
    const { componentDrift, hasDrift } = await import("@/domain/cardComponents");
    const form = annexDefaultVersion();
    const repo = new QualificationRepository(app);
    await version(V3, 103);
    const { id } = await new QualificationService(
      repo,
      {
        parse: () => ({
          systemName: "MCAS", systemVersion: "1.3.0", company: "LIST", description: "d",
          targetUseCase: "u", targetUsers: "t", intendedDeployers: null, systemType: null, purpose: null,
          providerTerm: null, deployerTerm: null, targetSystemTags: [], sectorTags: [], marketFormTags: [],
          localityTags: [], answers: [], risks: [], systemComponents: [], formVersionId: form.versionId,
        }),
      } as never,
      { createVersion: async () => ({ pid: V3, project_id: E }), listVersions: async () => [], syncTargets: async () => undefined } as never,
      async () => ({ resolve: async () => form }) as never,
      undefined,
      engine as never,
    ).createFromForm(E, new FormData());

    const card = (await repo.find(id))!;
    expect(
      card.components.map(({ componentPid, airoProperty, name, componentType, objectName, componentKey }) => ({
        componentPid, airoProperty, name, componentType, objectName, componentKey,
      })),
    ).toEqual([
      { componentPid: ENGINE[1].pid, airoProperty: "hasModel", name: "Scorer", componentType: "model", objectName: "models/m.pkl", componentKey: null },
      { componentPid: ENGINE[0].pid, airoProperty: "hasComponent", name: "Loans", componentType: "dataset", objectName: "data/loans.csv", componentKey: null },
    ].sort((a, b) => a.componentPid.localeCompare(b.componentPid)));
    expect(hasDrift(componentDrift(card.components, ENGINE))).toBe(false);
    // a re-upload in the engine is drift against what the card saved
    expect(componentDrift(card.components, [ENGINE[0], { ...ENGINE[1], data: "models/m2.pkl" }]).changed).toHaveLength(1);
  });
});
