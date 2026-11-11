import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { QualificationRepository } from "@/server/repositories/QualificationRepository";

// A version's card can have several revisions: corrections of the description that
// do not make a new version. Only the latest revision of the latest version changes;
// every earlier revision is kept as it was, by the database itself.
//
// Runs only against a throwaway project database (see cardVersions.db.test.ts). Every test
// works inside a transaction that is rolled back, so the versions it makes are never seen by
// the other files, which also decide what the latest version is in this database.

const APP_URL = process.env.QUALIFICATION_TEST_DATABASE_URL ?? "";
const ADMIN_URL = process.env.QUALIFICATION_TEST_ADMIN_URL ?? "";
const enabled = APP_URL !== "" && ADMIN_URL !== "";
if (enabled && (/:5432\//.test(APP_URL) || /:5432\//.test(ADMIN_URL))) {
  throw new Error(
    "refusing to run the DB tests against port 5432 (the live stack)",
  );
}

let admin: PrismaClient;

beforeAll(() => {
  if (!enabled) return;
  admin = new PrismaClient({ datasourceUrl: ADMIN_URL });
});
afterAll(async () => {
  await admin?.$disconnect();
});

type Tx = Prisma.TransactionClient;
class Rollback extends Error {}

async function inRolledBackTx(work: (tx: Tx) => Promise<void>): Promise<void> {
  try {
    await admin.$transaction(
      async (tx) => {
        await work(tx);
        throw new Rollback();
      },
      { timeout: 30_000 },
    );
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
  }
}

// the statement must raise; a savepoint keeps the transaction usable afterwards
async function refused(tx: Tx, sql: string): Promise<void> {
  await tx.$executeRawUnsafe("SAVEPOINT attempt");
  let raised = false;
  try {
    await tx.$executeRawUnsafe(sql);
  } catch {
    raised = true;
  }
  await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT attempt");
  expect(raised, sql).toBe(true);
}

async function newLatestVersion(tx: Tx): Promise<string> {
  const pid = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO project.system (pid, number, name, version)
     VALUES ('${pid}', (SELECT coalesce(max(number), 0) + 1 FROM project.system), 'MCAS', '1')`,
  );
  return pid;
}

let counter = 0;
async function addCard(
  tx: Tx,
  systemId: string,
  extra: {
    revision?: number;
    amends?: string | null;
    reason?: string | null;
    by?: string | null;
  } = {},
): Promise<string> {
  const id = `rev-card-${randomUUID()}-${counter++}`;
  const q = (v: string | null | undefined) => (v == null ? "NULL" : `'${v}'`);
  await tx.$executeRawUnsafe(
    `INSERT INTO qualification.qualification
       (id, system_id, "systemName", "systemVersion", company, description, "targetUseCase",
        "targetUsers", updated_at, revision, amends_id, amend_reason, amend_requested_by)
     VALUES ('${id}', '${systemId}', 'MCAS', '1', 'LIST', 'd', 'u', 't', now(),
             ${extra.revision ?? 1}, ${q(extra.amends)}, ${q(extra.reason)}, ${q(extra.by)})`,
  );
  return id;
}
const correction = (first: string) => ({
  revision: 2,
  amends: first,
  reason: "provider name was wrong",
  by: "Eindhoven, email",
});

const answerSql = (card: string, q: string) =>
  `INSERT INTO qualification.qualification_answer (id, "qualificationId", "toolId", "questionId", answer)
   VALUES ('a-${randomUUID()}', '${card}', 't', '${q}', 'a')`;
const systemComponentSql = (card: string) =>
  `INSERT INTO qualification.qualification_component (id, qualification_id, position, key, name, kind)
   VALUES ('qc-${randomUUID()}', '${card}', 0, '${randomUUID()}', 'm', 'model')`;
const linkedItemSql = (card: string) =>
  `INSERT INTO qualification.card_component
     (id, qualification_id, component_pid, airo_property, name, component_type)
   VALUES ('cc-${randomUUID()}', '${card}', '${randomUUID()}', 'hasModel', 'm', 'model')`;

const riskSql = (card: string) =>
  `INSERT INTO qualification.qualification_risk
     (id, "qualificationId", "position", risk, source, consequence, affected)
   VALUES ('r-${randomUUID()}', '${card}', 0, 'r', 's', 'c', 'a')`;
const graphSql = (card: string) =>
  `INSERT INTO qualification.knowledge_graph
     (id, "qualificationId", digest, turtle, jsonld, nodes, triples)
   VALUES ('g-${randomUUID()}', '${card}', 'd', 't', '{}', 1, 1)`;

describe.skipIf(!enabled)("card revisions", () => {
  it("the unique index is on (system_id, revision), not on system_id alone", async () => {
    const rows = await admin.$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'qualification'
        AND tablename = 'qualification' AND indexdef LIKE 'CREATE UNIQUE%'
        AND indexname LIKE '%system_id%' ORDER BY indexname`,
    );
    expect(rows.map((r) => r.indexname)).toEqual([
      "qualification_system_id_revision_key",
    ]);
  });

  it("two cards of the same version with revisions 1 and 2 are allowed", () =>
    inRolledBackTx(async (tx) => {
      const v = await newLatestVersion(tx);
      const first = await addCard(tx, v);
      const second = await addCard(tx, v, correction(first));
      const rows = await tx.$queryRawUnsafe<
        { revision: number; amends_id: string | null }[]
      >(
        `SELECT revision, amends_id FROM qualification.qualification
          WHERE system_id = '${v}' ORDER BY revision`,
      );
      expect(rows).toEqual([
        { revision: 1, amends_id: null },
        { revision: 2, amends_id: first },
      ]);
      expect(second).not.toBe(first);
    }));

  it("the same revision twice for one version is refused", () =>
    inRolledBackTx(async (tx) => {
      const v = await newLatestVersion(tx);
      await addCard(tx, v);
      await tx.$executeRawUnsafe("SAVEPOINT attempt");
      await expect(addCard(tx, v)).rejects.toThrow();
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT attempt");
    }));

  it("revision 2 without reason, requested-by or amends is refused", () =>
    inRolledBackTx(async (tx) => {
      const v = await newLatestVersion(tx);
      const first = await addCard(tx, v);
      const full = correction(first);
      const broken = [
        { ...full, amends: null },
        { ...full, reason: null },
        { ...full, by: null },
        { ...full, reason: "" },
        { ...full, reason: "  " },
        { ...full, by: "" },
        { ...full, by: "  " },
      ];
      for (const extra of broken) {
        await tx.$executeRawUnsafe("SAVEPOINT attempt");
        await expect(
          addCard(tx, v, extra),
          JSON.stringify(extra),
        ).rejects.toThrow();
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT attempt");
      }
    }));

  it("a revision corrects the revision just before it, of the same version", () =>
    inRolledBackTx(async (tx) => {
      const other = await newLatestVersion(tx);
      const otherCard = await addCard(tx, other);
      const v = await newLatestVersion(tx);
      const first = await addCard(tx, v);
      const broken = [
        { ...correction(otherCard), revision: 2 }, // a card of another version
        { ...correction(first), revision: 3 }, // skips revision 2
      ];
      for (const extra of broken) {
        await tx.$executeRawUnsafe("SAVEPOINT attempt");
        await expect(addCard(tx, v, extra), JSON.stringify(extra)).rejects.toThrow(
          /corrects/,
        );
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT attempt");
      }
      const second = await addCard(tx, v, correction(first));
      await tx.$executeRawUnsafe("SAVEPOINT attempt");
      await expect(
        addCard(tx, v, { ...correction(first), revision: 3 }),
        "revision 3 naming revision 1",
      ).rejects.toThrow(/corrects/);
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT attempt");
      await addCard(tx, v, { ...correction(second), revision: 3 });
    }));

  it("revision 1 with a reason is refused", () =>
    inRolledBackTx(async (tx) => {
      const v = await newLatestVersion(tx);
      await tx.$executeRawUnsafe("SAVEPOINT attempt");
      await expect(addCard(tx, v, { reason: "no" })).rejects.toThrow();
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT attempt");
    }));

  it("card_is_current is true only for the latest revision of the latest version", () =>
    inRolledBackTx(async (tx) => {
      const v = await newLatestVersion(tx);
      const first = await addCard(tx, v);
      const second = await addCard(tx, v, correction(first));
      const rows = await tx.$queryRawUnsafe<{ a: boolean; b: boolean }[]>(
        `SELECT qualification.card_is_current('${first}') AS a,
                qualification.card_is_current('${second}') AS b`,
      );
      expect(rows[0]).toEqual({ a: false, b: true });
    }));

  it("an earlier revision of the latest version cannot change", () =>
    inRolledBackTx(async (tx) => {
      const v = await newLatestVersion(tx);
      const first = await addCard(tx, v);
      await addCard(tx, v, correction(first));
      await refused(
        tx,
        `UPDATE qualification.qualification SET description = 'changed' WHERE id = '${first}'`,
      );
      await refused(tx, answerSql(first, "1b"));
      await refused(tx, systemComponentSql(first));
      await refused(tx, linkedItemSql(first));
    }));

  it("an earlier revision's existing answer cannot be updated", () =>
    inRolledBackTx(async (tx) => {
      const v = await newLatestVersion(tx);
      const first = await addCard(tx, v);
      await tx.$executeRawUnsafe(answerSql(first, "1a"));
      await addCard(tx, v, correction(first));
      await refused(
        tx,
        `UPDATE qualification.qualification_answer SET answer = 'z' WHERE "qualificationId" = '${first}'`,
      );
    }));

  it("an earlier revision's risks and knowledge graph cannot be added or changed", () =>
    inRolledBackTx(async (tx) => {
      const v = await newLatestVersion(tx);
      const first = await addCard(tx, v);
      await tx.$executeRawUnsafe(riskSql(first));
      await tx.$executeRawUnsafe(graphSql(first));
      await addCard(tx, v, correction(first));
      await refused(tx, riskSql(first));
      await refused(
        tx,
        `UPDATE qualification.qualification_risk SET risk = 'z' WHERE "qualificationId" = '${first}'`,
      );
      await refused(
        tx,
        `UPDATE qualification.knowledge_graph SET digest = 'z' WHERE "qualificationId" = '${first}'`,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM qualification.knowledge_graph WHERE "qualificationId" = '${first}'`,
      );
      await refused(tx, graphSql(first));
    }));

  it("a row of an earlier revision cannot be moved onto the current card", () =>
    inRolledBackTx(async (tx) => {
      const v = await newLatestVersion(tx);
      const first = await addCard(tx, v);
      await tx.$executeRawUnsafe(riskSql(first));
      await tx.$executeRawUnsafe(graphSql(first));
      await tx.$executeRawUnsafe(answerSql(first, "1a"));
      await tx.$executeRawUnsafe(systemComponentSql(first));
      await tx.$executeRawUnsafe(linkedItemSql(first));
      const second = await addCard(tx, v, correction(first));
      for (const [table, column] of [
        ["qualification_risk", `"qualificationId"`],
        ["knowledge_graph", `"qualificationId"`],
        ["qualification_answer", `"qualificationId"`],
        ["qualification_component", "qualification_id"],
        ["card_component", "qualification_id"],
      ]) {
        await refused(
          tx,
          `UPDATE qualification.${table} SET ${column} = '${second}' WHERE ${column} = '${first}'`,
        );
      }
    }));

  it("the current card's risks and knowledge graph still change", () =>
    inRolledBackTx(async (tx) => {
      const v = await newLatestVersion(tx);
      const first = await addCard(tx, v);
      const second = await addCard(tx, v, correction(first));
      await tx.$executeRawUnsafe(riskSql(second));
      await tx.$executeRawUnsafe(graphSql(second));
      await tx.$executeRawUnsafe(
        `UPDATE qualification.qualification_risk SET risk = 'z' WHERE "qualificationId" = '${second}'`,
      );
      await tx.$executeRawUnsafe(
        `UPDATE qualification.knowledge_graph SET digest = 'z' WHERE "qualificationId" = '${second}'`,
      );
    }));

  it("a revision another one corrects cannot be deleted on its own", () =>
    inRolledBackTx(async (tx) => {
      const v = await newLatestVersion(tx);
      const first = await addCard(tx, v);
      const second = await addCard(tx, v, correction(first));
      await refused(tx, `DELETE FROM qualification.qualification WHERE id = '${first}'`);
      const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM qualification.qualification WHERE system_id = '${v}' ORDER BY revision`,
      );
      expect(rows.map((r) => r.id)).toEqual([first, second]);
    }));

  it("the latest revision of the latest version still changes in place", () =>
    inRolledBackTx(async (tx) => {
      const v = await newLatestVersion(tx);
      const first = await addCard(tx, v);
      const second = await addCard(tx, v, correction(first));
      await tx.$executeRawUnsafe(
        `UPDATE qualification.qualification SET description = 'edited' WHERE id = '${second}'`,
      );
      await tx.$executeRawUnsafe(answerSql(second, "1a"));
      await tx.$executeRawUnsafe(systemComponentSql(second));
      await tx.$executeRawUnsafe(linkedItemSql(second));
      const rows = await tx.$queryRawUnsafe<{ description: string }[]>(
        `SELECT description FROM qualification.qualification WHERE id = '${second}'`,
      );
      expect(rows[0].description).toBe("edited");
    }));

  it("the only revision of the latest version still changes in place", () =>
    inRolledBackTx(async (tx) => {
      const v = await newLatestVersion(tx);
      const only = await addCard(tx, v);
      await tx.$executeRawUnsafe(
        `UPDATE qualification.qualification SET description = 'edited' WHERE id = '${only}'`,
      );
      await tx.$executeRawUnsafe(answerSql(only, "1a"));
    }));

  it("a card of an older version does not change even at its highest revision", () =>
    inRolledBackTx(async (tx) => {
      const old = await newLatestVersion(tx);
      const first = await addCard(tx, old);
      const second = await addCard(tx, old, correction(first));
      await newLatestVersion(tx);
      await refused(
        tx,
        `UPDATE qualification.qualification SET description = 'changed' WHERE id = '${second}'`,
      );
    }));

  it("deleting a version removes all its revisions, with their risks and graphs", () =>
    inRolledBackTx(async (tx) => {
      const v = await newLatestVersion(tx);
      const first = await addCard(tx, v);
      await tx.$executeRawUnsafe(riskSql(first));
      await tx.$executeRawUnsafe(graphSql(first));
      const second = await addCard(tx, v, correction(first));
      await tx.$executeRawUnsafe(riskSql(second));
      await tx.$executeRawUnsafe(graphSql(second));
      await tx.$executeRawUnsafe(
        `DELETE FROM project.system WHERE pid = '${v}'`,
      );
      const rows = await tx.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM qualification.qualification WHERE system_id = '${v}'`,
      );
      expect(Number(rows[0].n)).toBe(0);
      const left = await tx.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT (SELECT count(*) FROM qualification.qualification_risk
                  WHERE "qualificationId" IN ('${first}', '${second}'))
              + (SELECT count(*) FROM qualification.knowledge_graph
                  WHERE "qualificationId" IN ('${first}', '${second}')) AS n`,
      );
      expect(Number(left[0].n)).toBe(0);
    }));

  it("the repository reads a version's card as its highest revision", () =>
    inRolledBackTx(async (tx) => {
      const v = await newLatestVersion(tx);
      const first = await addCard(tx, v);
      const second = await addCard(tx, v, correction(first));
      const repo = new QualificationRepository(tx as unknown as PrismaClient);
      expect((await repo.findBySystem(v))?.id).toBe(second);
      const refs = (await repo.cardRefs()).filter((r) => r.systemId === v);
      expect(refs.map((r) => [r.id, r.revision]).sort()).toEqual(
        [
          [first, 1],
          [second, 2],
        ].sort(),
      );
      const revisions = await repo.revisionsOf(v);
      expect(revisions.map((r) => r.revision)).toEqual([2, 1]);
      expect(revisions[0]).toMatchObject({
        id: second,
        amendReason: "provider name was wrong",
        amendRequestedBy: "Eindhoven, email",
      });
      expect(revisions[1]).toMatchObject({
        id: first,
        amendReason: null,
        amendRequestedBy: null,
      });
    }));

  it("the repository says which card is current and where each stands among its revisions", () =>
    inRolledBackTx(async (tx) => {
      const v = await newLatestVersion(tx);
      const first = await addCard(tx, v);
      const second = await addCard(tx, v, correction(first));
      const repo = new QualificationRepository(tx as unknown as PrismaClient);
      expect(await repo.isCurrent(first)).toBe(false);
      expect(await repo.isCurrent(second)).toBe(true);
      expect(await repo.cardStanding(first)).toEqual({ systemId: v, latestRevision: false });
      expect(await repo.cardStanding(second)).toEqual({ systemId: v, latestRevision: true });
      expect(await repo.cardStanding("no-such-card")).toBeNull();
    }));

  it("existing cards read as revision 1 after the migration", async () => {
    const col = await admin.$queryRawUnsafe<{ d: string; nullable: string }[]>(
      `SELECT column_default AS d, is_nullable AS nullable
         FROM information_schema.columns
        WHERE table_schema = 'qualification' AND table_name = 'qualification'
          AND column_name = 'revision'`,
    );
    expect(col).toEqual([{ d: "1", nullable: "NO" }]);
    const rows = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM qualification.qualification
        WHERE revision <> 1 AND amends_id IS NULL`,
    );
    expect(Number(rows[0].n)).toBe(0);
  });
});
