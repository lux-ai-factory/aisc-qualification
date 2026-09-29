import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

// WP3 (pipeline 2026-09-23): a card points at one row of the card versions, the
// card version. Only the latest version's card may change; older ones are kept as
// they were, by the database itself, and deleting a version takes its card with it.
//
// Isolation Q1: the versions are project.system of the project's own database, and
// the card names no project (the database is the project). Runs only against a
// throwaway project database: test/db/throwaway-db.sh provisions project F the
// platform's way, migrates it and sets the variables. Never the live DB.

const APP_URL = process.env.QUALIFICATION_TEST_DATABASE_URL ?? "";
const ADMIN_URL = process.env.QUALIFICATION_TEST_ADMIN_URL ?? "";
const enabled = APP_URL !== "" && ADMIN_URL !== "";
if (enabled && (/:5432\//.test(APP_URL) || /:5432\//.test(ADMIN_URL))) {
  throw new Error("refusing to run the DB tests against port 5432 (the live stack)");
}

let app: PrismaClient;
let admin: PrismaClient;

beforeAll(() => {
  if (!enabled) return;
  app = new PrismaClient({ datasourceUrl: APP_URL });
  admin = new PrismaClient({ datasourceUrl: ADMIN_URL });
});
afterAll(async () => {
  await app?.$disconnect();
  await admin?.$disconnect();
});

function card(systemId: string, name: string) {
  return {
    systemId, systemName: name, systemVersion: "1", company: "LIST",
    description: "d", targetUseCase: "u", targetUsers: "t",
  };
}

describe.skipIf(!enabled)("the migration's schema (catalog)", () => {
  // S3.3, S3.7: the card's key is into the project's card versions, and cascades from it
  it("S3.7 qualification.system_id references project.system(pid) ON DELETE CASCADE", async () => {
    const rows = await admin.$queryRawUnsafe<{ target: string; del: string }[]>(
      `SELECT confrelid::regclass::text AS target, confdeltype::text AS del
         FROM pg_constraint WHERE conname = 'qualification_system_id_fkey'`,
    );
    expect(rows).toEqual([{ target: "project.system", del: "c" }]);
  });

  it("S3.1 one card per version: the unique index on system_id stays (already passing)", async () => {
    const rows = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM pg_indexes
        WHERE schemaname = 'qualification' AND indexname = 'qualification_system_id_key'`,
    );
    expect(Number(rows[0].n)).toBe(1);
  });

  it("S3.3 has card_is_latest(uuid) and the three only-latest triggers", async () => {
    const fn = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'qualification' AND p.proname = 'card_is_latest'`,
    );
    expect(Number(fn[0].n)).toBe(1);
    const triggers = await admin.$queryRawUnsafe<{ tgname: string }[]>(
      `SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname IN
         ('qualification_only_latest_changes','qualification_answer_only_latest_changes',
          'card_component_only_latest_changes') ORDER BY tgname`,
    );
    expect(triggers.map((t) => t.tgname)).toEqual([
      "card_component_only_latest_changes",
      "qualification_answer_only_latest_changes",
      "qualification_only_latest_changes",
    ]);
  });

  it("S3.7 no DELETE trigger on the answers, so the version cascade is never blocked", async () => {
    const rows = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      // tgtype bit 3 (8) is DELETE
      `SELECT count(*) AS n FROM pg_trigger
        WHERE NOT tgisinternal AND (tgtype & 8) <> 0
          AND tgrelid IN ('qualification.qualification'::regclass,
                          'qualification.qualification_answer'::regclass)`,
    );
    expect(Number(rows[0].n)).toBe(0);
  });

  it("WP3 step 6 card_component has the columns, the unique pair and the component index", async () => {
    const cols = await admin.$queryRawUnsafe<{ column_name: string; is_nullable: string }[]>(
      `SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_schema = 'qualification' AND table_name = 'card_component'
        ORDER BY column_name`,
    );
    expect(cols).toEqual([
      { column_name: "airo_property", is_nullable: "NO" },
      // targets plan v2 (20260929000000_system_components): which part of the system the item is
      { column_name: "component_key", is_nullable: "YES" },
      { column_name: "component_pid", is_nullable: "NO" },
      { column_name: "component_type", is_nullable: "NO" },
      { column_name: "id", is_nullable: "NO" },
      { column_name: "linked_at", is_nullable: "NO" },
      { column_name: "name", is_nullable: "NO" },
      { column_name: "object_name", is_nullable: "NO" },
      { column_name: "qualification_id", is_nullable: "NO" },
    ]);
    const idx = await admin.$queryRawUnsafe<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = 'qualification'
        AND tablename = 'card_component'`,
    );
    const defs = idx.map((i) => i.indexdef).join("\n");
    expect(defs).toMatch(/UNIQUE INDEX .*\(qualification_id, component_pid\)/);
    expect(defs).toMatch(/INDEX .*\(component_pid\)/);
  });
});

describe.skipIf(!enabled)("only the latest card version changes (S3.3, S3.7)", () => {
  const v1 = randomUUID();
  const v2 = randomUUID();
  let c1 = "";
  let c2 = "";

  beforeAll(async () => {
    // numbers above any other test's in this database, so v2 is the latest here
    const top = await admin.$queryRawUnsafe<{ n: number }[]>(
      `SELECT coalesce(max(number), 0)::int AS n FROM project.system`,
    );
    const n1 = top[0].n + 1;
    await admin.$executeRawUnsafe(
      `INSERT INTO project.system (pid, number, name, version) VALUES ('${v1}', ${n1}, 'MCAS', '1')`,
    );
    c1 = (
      await app.qualification.create({
        data: {
          ...card(v1, "MCAS"),
          answers: { create: [{ toolId: "annex-1", questionId: "1a", answer: "a" }] },
          risks: { create: [{ position: 0, risk: "r", source: "s", consequence: "c",
                             affected: "user", control: "k" }] },
        },
      })
    ).id;
    await admin.$executeRawUnsafe(
      `INSERT INTO project.system (pid, number, name, version) VALUES ('${v2}', ${n1 + 1}, 'MCAS', '1')`,
    );
    c2 = (await app.qualification.create({ data: card(v2, "MCAS") })).id;
  });

  it("S3.3 card_is_latest says which version is the latest", async () => {
    const rows = await app.$queryRawUnsafe<{ a: boolean; b: boolean }[]>(
      `SELECT qualification.card_is_latest('${v1}'::uuid) AS a,
              qualification.card_is_latest('${v2}'::uuid) AS b`,
    );
    expect(rows[0]).toEqual({ a: false, b: true });
  });

  it("S3.3 an UPDATE of the v1 card raises once v2 exists", async () => {
    await expect(
      app.qualification.update({ where: { id: c1 }, data: { description: "changed" } }),
    ).rejects.toThrow();
  });

  it("S3.3 inserting or updating an answer of the v1 card raises", async () => {
    await expect(
      app.qualificationAnswer.create({
        data: { qualificationId: c1, toolId: "annex-1", questionId: "1b", answer: "b" },
      }),
    ).rejects.toThrow();
    await expect(
      app.qualificationAnswer.updateMany({ where: { qualificationId: c1 }, data: { answer: "z" } }),
    ).rejects.toThrow();
  });

  it("S3.3 linking a component on the v1 card raises (S6.4)", async () => {
    await expect(
      app.$executeRawUnsafe(
        `INSERT INTO qualification.card_component
           (id, qualification_id, component_pid, airo_property, name, component_type)
         VALUES ('cc-old', '${c1}', '${randomUUID()}', 'hasModel', 'm', 'model')`,
      ),
    ).rejects.toThrow();
  });

  it("S3.3/S3.4 the latest card and its answers and components still change in place", async () => {
    await app.qualification.update({ where: { id: c2 }, data: { description: "edited" } });
    await app.qualificationAnswer.create({
      data: { qualificationId: c2, toolId: "annex-1", questionId: "1a", answer: "a2" },
    });
    await app.$executeRawUnsafe(
      `INSERT INTO qualification.card_component
         (id, qualification_id, component_pid, airo_property, name, component_type)
       VALUES ('cc-new', '${c2}', '${randomUUID()}', 'hasTestingData', 'd', 'dataset')`,
    );
    const found = await app.qualification.findUnique({ where: { id: c2 } });
    expect(found?.description).toBe("edited");
  });

  it("WP3 step 6 card_component refuses a property that is not one of the five", async () => {
    await expect(
      app.$executeRawUnsafe(
        `INSERT INTO qualification.card_component
           (id, qualification_id, component_pid, airo_property, name, component_type)
         VALUES ('cc-bad', '${c2}', '${randomUUID()}', 'hasFriend', 'x', 'model')`,
      ),
    ).rejects.toThrow();
  });

  it("S3.7 deleting a version removes its card, answers, risks, graph and components", async () => {
    await app.knowledgeGraph.create({
      data: { qualificationId: c2, digest: "d", turtle: "t", jsonld: "{}", nodes: 1, triples: 1 },
    });
    await admin.$executeRawUnsafe(`DELETE FROM project.system WHERE pid IN ('${v1}', '${v2}')`);
    const left = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT (SELECT count(*) FROM qualification.qualification WHERE id IN ('${c1}','${c2}'))
            + (SELECT count(*) FROM qualification.qualification_answer WHERE "qualificationId" IN ('${c1}','${c2}'))
            + (SELECT count(*) FROM qualification.qualification_risk WHERE "qualificationId" IN ('${c1}','${c2}'))
            + (SELECT count(*) FROM qualification.knowledge_graph WHERE "qualificationId" IN ('${c1}','${c2}'))
            + (SELECT count(*) FROM qualification.card_component WHERE qualification_id IN ('${c1}','${c2}'))
            + (SELECT count(*) FROM project.system WHERE pid IN ('${v1}', '${v2}')) AS n`,
    );
    expect(Number(left[0].n)).toBe(0);
  });
});
