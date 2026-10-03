import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

// The Components block in a real project database: migration
// 20260929000000_system_components on the throwaway of test/db/throwaway-db.sh. Never the live DB.

const TEMPLATE = process.env.QUALIFICATION_TEST_PROJECT_DATABASE_URL ?? "";
const ADMIN_TEMPLATE = process.env.QUALIFICATION_TEST_PROJECT_ADMIN_URL ?? "";
const [, , , E] = (process.env.QUALIFICATION_TEST_PROJECTS ?? "").split(",");
const enabled = TEMPLATE !== "" && ADMIN_TEMPLATE !== "" && !!E;
if (enabled && [TEMPLATE, ADMIN_TEMPLATE].some((u) => /:5432\//.test(u))) {
  throw new Error("refusing to run the DB tests against port 5432 (the live stack)");
}

const APP = resolve(__dirname, "..", "..");
const dbName = (pid: string) => `project_${pid.toLowerCase().replace(/-/g, "")}`;
const at = (template: string, database: string) => template.replace("{database}", database);
let su: PrismaClient;

const V1 = "c0c0c0c0-0000-4000-8000-000000000001";
const V2 = "c0c0c0c0-0000-4000-8000-000000000002";
const K1 = "c0c0c0c0-1111-4000-8000-000000000001";
const K2 = "c0c0c0c0-1111-4000-8000-000000000002";

const card = (id: string, systemId: string) => `
  INSERT INTO qualification.qualification (id, system_id, "systemName", "systemVersion", company,
    description, "targetUseCase", "targetUsers", updated_at)
  VALUES ('${id}', '${systemId}', 'MCAS', '1', 'LIST', 'd', 'u', 't', now())`;
const part = (id: string, cardId: string, key: string, name: string, over = "") => `
  INSERT INTO qualification.qualification_component (id, qualification_id, position, key, name, kind${over ? ", " + over.split("=")[0] : ""})
  VALUES ('${id}', '${cardId}', 0, '${key}', '${name}', 'model'${over ? ", " + over.split("=")[1] : ""})`;

async function fails(sql: string): Promise<string> {
  try {
    await su.$executeRawUnsafe(sql);
    return "";
  } catch (err) {
    return String((err as Error).message);
  }
}

beforeAll(async () => {
  if (!enabled) return;
  const run = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: APP, env: { ...process.env, DATABASE_URL: at(TEMPLATE, dbName(E)) }, encoding: "utf8", timeout: 240_000,
  });
  if (run.status !== 0) throw new Error(`migrate deploy failed: ${(run.stdout + run.stderr).slice(-600)}`);
  su = new PrismaClient({ datasourceUrl: at(ADMIN_TEMPLATE, dbName(E)) });
  await su.$executeRawUnsafe(`INSERT INTO project.system (pid, number, name) VALUES ('${V1}', 1, 'MCAS') ON CONFLICT DO NOTHING`);
  await su.$executeRawUnsafe(card("comp-card-1", V1));
}, 300_000);

afterAll(async () => {
  await su?.$disconnect();
});

describe.skipIf(!enabled)("QL1 the rows' rules, in the database", () => {
  it("a row is kept with its key", async () => {
    expect(await fails(part("p1", "comp-card-1", K1, "Scoring model"))).toBe("");
  });

  it("one key per card, and one name per card whatever its case", async () => {
    expect(await fails(part("p2", "comp-card-1", K1, "Other"))).toMatch(/23505|already exists/);
    expect(await fails(part("p3", "comp-card-1", K2, " scoring MODEL"))).toMatch(/23505|already exists/);
  });

  it("a test set is not a kind", async () => {
    expect(await fails(`${part("p4", "comp-card-1", K2, "Test set").replace("'model'", "'test_data'")}`)).toMatch(/check/i);
  });

  it("a third party needs its name", async () => {
    expect(await fails(part("p5", "comp-card-1", K2, "LLM", "provider='third_party'"))).toMatch(/check/i);
  });
});

describe.skipIf(!enabled)("QL7 a linked engine item may say which part it is", () => {
  const link = (id: string, pid: string, prop: string, key: string) => `
    INSERT INTO qualification.card_component (id, qualification_id, component_pid, airo_property, name, component_type, component_key)
    VALUES ('${id}', 'comp-card-1', '${pid}', '${prop}', 'x', 'dataset', '${key}')`;

  it("a component of the same card", async () => {
    expect(await fails(link("l1", "d0d0d0d0-0000-4000-8000-000000000001", "hasModel", K1))).toBe("");
  });

  it("not a component of this card", async () => {
    expect(await fails(link("l2", "d0d0d0d0-0000-4000-8000-000000000002", "hasModel", K2))).toMatch(/not on AI card/);
  });

  it("test material is never a part", async () => {
    expect(await fails(link("l3", "d0d0d0d0-0000-4000-8000-000000000003", "hasTestingData", K1))).toMatch(/check/i);
  });
});

// The form speaks VAIR (migration 20260930000000_vair_terms): the terms the author
// chose are kept beside the text, in nullable columns, and read back through the Prisma names.
describe.skipIf(!enabled)("the VAIR terms a card is saved with", () => {
  it("are stored and read back through Prisma", async () => {
    await su.$executeRawUnsafe(`UPDATE qualification.qualification
      SET system_type = 'NarrowAI', purpose = 'AssessingCreditworthiness' WHERE id = 'comp-card-1'`);
    expect(await fails(`${part("pv", "comp-card-1", "c0c0c0c0-1111-4000-8000-0000000000a1", "Scoring tree", "vair_type='DecisionTree'")}`)).toBe("");
    expect(await fails(`INSERT INTO qualification.qualification_risk (id, "qualificationId", position, risk, source,
        source_term, consequence, consequence_term, impact_term, affected, "impactAreas", control, control_term,
        "followUpControl", follow_up_control_term)
      VALUES ('rv', 'comp-card-1', 0, 'r', 's', 'ErroneousInputData', 'c', NULL, 'UnfavourableTreatment', 'user',
        ARRAY['Right'], 'k', 'HumanOversightMeasure', 'f', 'OverridingOutcome')`)).toBe("");

    const app = new PrismaClient({ datasourceUrl: at(TEMPLATE, dbName(E)) });
    try {
      const card = await app.qualification.findUniqueOrThrow({
        where: { id: "comp-card-1" },
        include: { risks: true, systemComponents: true },
      });
      expect([card.systemType, card.purpose]).toEqual(["NarrowAI", "AssessingCreditworthiness"]);
      expect(card.systemComponents.find((c) => c.id === "pv")?.vairType).toBe("DecisionTree");
      expect(card.risks.find((r) => r.id === "rv")).toMatchObject({
        sourceTerm: "ErroneousInputData",
        consequenceTerm: null,
        impactTerm: "UnfavourableTreatment",
        controlTerm: "HumanOversightMeasure",
        followUpControlTerm: "OverridingOutcome",
      });
    } finally {
      await app.$disconnect();
    }
  });

  it("an older row without them still reads, with nulls", async () => {
    expect(await fails(part("pn", "comp-card-1", "c0c0c0c0-1111-4000-8000-0000000000a2", "Pipeline"))).toBe("");
    const rows = await su.$queryRawUnsafe<{ vair_type: string | null }[]>(
      `SELECT vair_type FROM qualification.qualification_component WHERE id = 'pn'`);
    expect(rows[0].vair_type).toBeNull();
  });
});

describe.skipIf(!enabled)("QL3 only the latest card version's components change", () => {
  it("once a newer version exists, the older card's components are kept as they were", async () => {
    await su.$executeRawUnsafe(`INSERT INTO project.system (pid, number, name) VALUES ('${V2}', 2, 'MCAS') ON CONFLICT DO NOTHING`);
    expect(await fails(part("p9", "comp-card-1", K2, "Training data"))).toMatch(/not the latest/);
    expect(await fails(`UPDATE qualification.qualification_component SET name = 'Renamed' WHERE id = 'p1'`)).toMatch(/not the latest/);
  });
});
