import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

import { questionSetsOn } from "@/server/services/QuestionSetService";
import { questionnairesOn } from "@/server/services/QuestionnaireService";

// Forms inside a project, against real project databases: the question sets and questionnaires a person makes are kept in their own project's database
// and nowhere else; the builtin Annex IV set and default questionnaire are seeded into
// every project database by the forms migrations and cannot be changed there; a card's
// questionnaire version is a real key into the same database. There is no install-wide
// library in `platform`.
//
// Throwaway only: test/db/throwaway-db.sh makes projects A and B the platform's way.

const TEMPLATE = process.env.QUALIFICATION_TEST_PROJECT_DATABASE_URL ?? "";
const ADMIN_TEMPLATE = process.env.QUALIFICATION_TEST_PROJECT_ADMIN_URL ?? "";
const [A, B] = (process.env.QUALIFICATION_TEST_PROJECTS ?? "").split(",");
const enabled =
  TEMPLATE !== "" && ADMIN_TEMPLATE !== "" && Boolean(A) && Boolean(B);
if (enabled && [TEMPLATE, ADMIN_TEMPLATE].some((u) => /:5432\//.test(u))) {
  throw new Error(
    "refusing to run the DB tests against port 5432 (the live stack)",
  );
}

const APP = resolve(__dirname, "..", "..");
const dbName = (pid: string) =>
  `project_${pid.toLowerCase().replace(/-/g, "")}`;
const at = (template: string, database: string) =>
  template.replace("{database}", database);
const clients: PrismaClient[] = [];
function client(url: string) {
  const c = new PrismaClient({ datasourceUrl: url });
  clients.push(c);
  return c;
}

/** Bring a project database to this app's schema, as the app does on first open. */
function migrate(pid: string): string {
  const run = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: APP,
    env: { ...process.env, DATABASE_URL: at(TEMPLATE, dbName(pid)) },
    encoding: "utf8",
    timeout: 240_000,
  });
  return run.status === 0
    ? ""
    : `${dbName(pid)}: ${(run.stdout + run.stderr).split("\n").filter(Boolean).slice(-4).join(" | ")}`;
}

const draftSet = (name: string) => ({
  name,
  questions: [
    {
      text: `What does ${name} ask?`,
      citation: "",
      required: true,
      annexPoint: null,
    },
  ],
});

describe.skipIf(!enabled)(
  "forms are kept in the project's own database",
  () => {
    let why = "";
    let dbA: PrismaClient;
    let dbB: PrismaClient;
    const name = `Set ${randomUUID().slice(0, 8)}`;

    beforeAll(async () => {
      why = [migrate(A), migrate(B)].filter(Boolean).join("; ");
      dbA = client(at(TEMPLATE, dbName(A)));
      dbB = client(at(TEMPLATE, dbName(B)));
    }, 300_000);

    afterAll(async () => {
      await Promise.all(clients.map((c) => c.$disconnect()));
    });

    it("every project database has the builtin Annex IV set (14 questions) and the default questionnaire", async () => {
      expect(why).toBe("");
      for (const db of [dbA, dbB]) {
        const sets = await db.$queryRawUnsafe<{ id: string; origin: string }[]>(
          `SELECT id, origin FROM qualification.question_set WHERE origin = 'builtin'`,
        );
        expect(sets).toEqual([{ id: "annex-iv", origin: "builtin" }]);
        const q = await db.$queryRawUnsafe<{ id: string; n: bigint }[]>(
          `SELECT q.id, (SELECT count(*) FROM qualification.questionnaire_version v
                         JOIN qualification.questionnaire_version_item i ON i.questionnaire_version_id = v.id
                        WHERE v.questionnaire_id = q.id) AS n
           FROM qualification.questionnaire q WHERE q.origin = 'builtin'`,
        );
        expect(q.map((r) => [r.id, Number(r.n)])).toEqual([
          ["annex-iv-default", 14],
        ]);
      }
    });

    it("the builtin set cannot be changed in a project database", async () => {
      expect(why).toBe("");
      const err = await dbA
        .$executeRawUnsafe(
          `UPDATE qualification.question_set SET name = 'Changed' WHERE id = 'annex-iv'`,
        )
        .then(() => null)
        .catch((e: unknown) => String((e as Error).message ?? e));
      expect(err, "the builtin set was renamed").not.toBeNull();
    });

    it("a question set saved in A is listed in A and not in B", async () => {
      expect(why).toBe("");
      const saved = await questionSetsOn(dbA).saveDraft(draftSet(name), {
        createdBy: "tester",
      });
      expect(saved.ok, JSON.stringify(saved)).toBe(true);
      const inA = (await questionSetsOn(dbA).list()).map((r) => r.name);
      const inB = (await questionSetsOn(dbB).list()).map((r) => r.name);
      expect(inA).toContain(name);
      expect(inB).not.toContain(name);
      expect(inB).toContain("Annex IV");
    });

    it("a questionnaire saved in A is in A's chooser and not in B's; both offer the default", async () => {
      expect(why).toBe("");
      const set = (await questionSetsOn(dbA).list()).find(
        (r) => r.name === name,
      );
      expect(set, "the set of the previous test").toBeDefined();
      const version = await questionSetsOn(dbA).atNumber(set!.setId);
      const qName = `Questionnaire ${randomUUID().slice(0, 8)}`;
      const saved = await questionnairesOn(dbA).saveDraft(
        {
          name: qName,
          blocks: [],
          items: version!.questions.map((q) => ({
            setVersionId: set!.versionId,
            questionId: q.questionId,
          })),
        },
        { listed: true, createdBy: "tester" },
      );
      expect(saved.ok, JSON.stringify(saved)).toBe(true);
      const inA = (await questionnairesOn(dbA).chooserOptions()).map(
        (o) => o.name,
      );
      const inB = (await questionnairesOn(dbB).chooserOptions()).map(
        (o) => o.name,
      );
      expect(inA).toContain(qName);
      expect(inB).not.toContain(qName);
      expect(inA).toContain("Annex IV default");
      expect(inB).toContain("Annex IV default");
    });

    it("a card's questionnaire version is a key into the same database's questionnaire_version", async () => {
      expect(why).toBe("");
      const fk = await client(at(ADMIN_TEMPLATE, dbName(A))).$queryRawUnsafe<
        { target: string }[]
      >(
        `SELECT confrelid::regclass::text AS target FROM pg_constraint
        WHERE conname = 'qualification_questionnaire_version_id_fkey'`,
      );
      expect(fk).toEqual([{ target: "qualification.questionnaire_version" }]);
    });

    it("platform holds no forms: no form_library schema, no question or form tables", async () => {
      expect(why).toBe("");
      const rows = await client(at(ADMIN_TEMPLATE, "platform")).$queryRawUnsafe<
        { t: string }[]
      >(
        `SELECT n.nspname || '.' || c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r' AND (n.nspname = 'form_library' OR c.relname ~ '^(form|question)')`,
      );
      expect(rows).toEqual([]);
    });
  },
);
