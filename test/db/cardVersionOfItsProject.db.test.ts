import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

// A card's version belongs to the card's project: (system_id, project_id) references
// core.system (pid, project_id), so a card cannot name project A and a version of B.
//
// Runs only against a throwaway database: test/db/throwaway-db.sh starts one,
// migrates it and sets the three variables. Never the live DB.

const APP_URL = process.env.QUALIFICATION_TEST_DATABASE_URL ?? "";
const ADMIN_URL = process.env.QUALIFICATION_TEST_ADMIN_URL ?? "";
const PSQL = process.env.QUALIFICATION_TEST_PSQL ?? "";
const enabled = APP_URL !== "" && ADMIN_URL !== "";
if (enabled && (/:5432\//.test(APP_URL) || /:5432\//.test(ADMIN_URL))) {
  throw new Error("refusing to run the DB tests against port 5432 (the live stack)");
}

const MIGRATION =
  "prisma/migrations/20260924120000_a_card_is_of_a_version_of_its_project/migration.sql";
const KEY = "qualification_system_id_project_id_fkey";

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

function card(projectId: string, systemId: string) {
  return {
    projectId, systemId, systemName: "MCAS", systemVersion: "1", company: "LIST",
    description: "d", targetUseCase: "u", targetUsers: "t",
  };
}

async function projectWithVersion(): Promise<[string, string]> {
  const project = randomUUID();
  const version = randomUUID();
  await admin.$executeRawUnsafe(
    `INSERT INTO core.project (pid, name, slug) VALUES ('${project}', 'T', 't-${project.slice(0, 8)}')`,
  );
  await admin.$executeRawUnsafe(
    `INSERT INTO core.system (pid, project_id, name, version, number)
     VALUES ('${version}', '${project}', 'MCAS', '1', 1)`,
  );
  return [project, version];
}

function psql(script: string): { out: string; err: string } {
  try {
    const out = execSync(PSQL + " -tA", { input: script, stdio: ["pipe", "pipe", "pipe"] });
    return { out: String(out), err: "" };
  } catch (e) {
    return { out: "", err: String((e as { stderr?: Buffer }).stderr ?? e) };
  }
}

describe.skipIf(!enabled)("a card is of a version of its own project", () => {
  it("the key is (system_id, project_id) into core.system (pid, project_id), ON DELETE CASCADE", async () => {
    const rows = await admin.$queryRawUnsafe<{ def: string; del: string }[]>(
      `SELECT pg_get_constraintdef(oid) AS def, confdeltype::text AS del
         FROM pg_constraint WHERE conname = '${KEY}'`,
    );
    expect(rows).toEqual([{
      def: "FOREIGN KEY (system_id, project_id) REFERENCES core.system(pid, project_id) ON DELETE CASCADE",
      del: "c",
    }]);
  });

  it("a card of project A naming a version of project B is refused", async () => {
    const [a] = await projectWithVersion();
    const [, bVersion] = await projectWithVersion();
    await expect(app.qualification.create({ data: card(a, bVersion) })).rejects.toThrow(KEY);
  });

  it("a card of its own project's version is accepted", async () => {
    const [a, aVersion] = await projectWithVersion();
    const made = await app.qualification.create({ data: card(a, aVersion) });
    expect(made.systemId).toBe(aVersion);
  });

  it("moving a card to another project, keeping its version, is refused", async () => {
    const [a, aVersion] = await projectWithVersion();
    const [b] = await projectWithVersion();
    const made = await app.qualification.create({ data: card(a, aVersion) });
    await expect(
      app.qualification.update({ where: { id: made.id }, data: { projectId: b } }),
    ).rejects.toThrow(KEY);
  });

  it("where core.system has no (pid, project_id) constraint yet, the migration leaves the key out and succeeds", () => {
    expect(existsSync(MIGRATION)).toBe(true);
    expect(PSQL).not.toBe("");
    const sql = readFileSync(MIGRATION, "utf8");
    const { out, err } = psql(`
      BEGIN;
      SET search_path TO qualification;
      ALTER TABLE qualification DROP CONSTRAINT ${KEY};
      ALTER TABLE core.system DROP CONSTRAINT system_pid_project_id_key;
      ${sql}
      SELECT 'keys=' || count(*) FROM pg_constraint WHERE conname = '${KEY}';
      ROLLBACK;`);
    expect(err).toBe("");
    expect(out).toContain("keys=0");
  });

  it("run again where the key exists, the migration changes nothing", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const { out, err } = psql(`
      BEGIN;
      SET search_path TO qualification;
      ${sql}
      SELECT 'keys=' || count(*) FROM pg_constraint WHERE conname = '${KEY}';
      ROLLBACK;`);
    expect(err).toBe("");
    expect(out).toContain("keys=1");
  });
});
