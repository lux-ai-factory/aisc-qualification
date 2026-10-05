import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

// One database per project, tested against real project databases.
//
// test/db/throwaway-db.sh makes them the platform's way (projectdb.provision, the real
// template) in a throwaway container and loads scripts/tests/fixtures/isolation/live_shape.sql
// (the schema-only shape of the live platform database, no data) into database
// `live_shape`. Never the live DB: every URL is on the throwaway's random port.

const TEMPLATE = process.env.QUALIFICATION_TEST_PROJECT_DATABASE_URL ?? "";
const ADMIN_TEMPLATE = process.env.QUALIFICATION_TEST_PROJECT_ADMIN_URL ?? "";
const SETUP = process.env.ISOLATION_SETUP ?? "";
const [A, B, C, E] = (process.env.QUALIFICATION_TEST_PROJECTS ?? "").split(",");
const enabled = TEMPLATE !== "" && ADMIN_TEMPLATE !== "";
if (enabled && [TEMPLATE, ADMIN_TEMPLATE].some((u) => /:5432\//.test(u))) {
  throw new Error(
    "refusing to run the DB tests against port 5432 (the live stack)",
  );
}

const APP = resolve(__dirname, "..", "..");
const MIGRATIONS = join(APP, "prisma", "migrations");
const BASELINE = "20260925000000_project_database";
const FORMS = [
  "20260925090000_forms_are_data",
  "20260925120000_the_default_form_is_fixed",
  "20260925150000_two_level_forms",
];
/** The readers' grant on the two-level forms tables, after the forms migrations. */
const READERS_READ_FORMS = "20260927000000_readers_read_the_forms";
const formsOnBranch = FORMS.every((d) =>
  existsSync(join(MIGRATIONS, d, "migration.sql")),
);

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
const admin = (pid: string) => client(at(ADMIN_TEMPLATE, dbName(pid)));

afterAll(async () => {
  await Promise.all(clients.map((c) => c.$disconnect()));
});

/** What a query on this database answers, or the error text. */
async function tryQuery<T>(
  c: PrismaClient,
  sql: string,
): Promise<T[] | string> {
  try {
    return await c.$queryRawUnsafe<T[]>(sql);
  } catch (err) {
    return String((err as Error).message ?? err)
      .split("\n")
      .slice(-3)
      .join(" ");
  }
}

function migrateProjects(extraEnv: Record<string, string> = {}) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PROJECT_DATABASE_URL: TEMPLATE,
    ...extraEnv,
  };
  delete env.DATABASE_URL;
  const script = join(APP, "scripts", "migrate-projects.mjs");
  if (!existsSync(script))
    return { status: -1, out: "I3.6: scripts/migrate-projects.mjs is missing" };
  const run = spawnSync("node", [script], {
    cwd: APP,
    env,
    encoding: "utf8",
    timeout: 240_000,
  });
  return { status: run.status ?? -1, out: `${run.stdout}\n${run.stderr}` };
}

async function migrations(pid: string): Promise<string[] | string> {
  const rows = await tryQuery<{ migration_name: string }>(
    admin(pid),
    `SELECT migration_name FROM qualification._prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`,
  );
  return typeof rows === "string" ? rows : rows.map((r) => r.migration_name);
}

/** Migrate project A the Prisma way if migrate-projects.mjs did not; the reason if it cannot. */
async function ensureMigrated(pid: string): Promise<string> {
  const done = await migrations(pid);
  if (Array.isArray(done) && done.includes(BASELINE)) return "";
  const run = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: APP,
    env: { ...process.env, DATABASE_URL: at(TEMPLATE, dbName(pid)) },
    encoding: "utf8",
    timeout: 240_000,
  });
  if (run.status !== 0) {
    return `qualification_rw could not migrate ${dbName(pid)} (I2.1 template 0007 grants CONNECT, I3.5 baseline): ${(run.stdout + run.stderr).split("\n").filter(Boolean).slice(-4).join(" | ")}`;
  }
  const after = await migrations(pid);
  return Array.isArray(after) && after.includes(BASELINE)
    ? ""
    : `I3.5: ${BASELINE} is not applied in ${dbName(pid)}: ${JSON.stringify(after)}`;
}

describe.skipIf(!enabled)("isolation setup", () => {
  it("the throwaway made the project databases and loaded the live shape", () => {
    expect(SETUP, `ISOLATION_SETUP from throwaway-db.sh`).toBe("ok");
  });
});

// migrate-projects.mjs

describe.skipIf(!enabled)("I3.6 scripts/migrate-projects.mjs", () => {
  let first: { status: number; out: string };
  beforeAll(() => {
    first = migrateProjects();
  }, 300_000);

  it("I3.6 exits 0 with project databases it may and may not enter", () => {
    expect(first.status, first.out.slice(-800)).toBe(0);
  });

  it("I3.6 migrates every project database qualification_rw may connect to (A, B, E)", async () => {
    for (const pid of [A, B, E]) {
      const names = await migrations(pid);
      expect(names, `${dbName(pid)}`).toContain(BASELINE);
    }
  });

  it("I3.6 skips a project database qualification_rw may not connect to, and a name that is not project_<32 hex>", async () => {
    const c = await tryQuery<{ n: bigint }>(
      admin(C),
      `SELECT count(*) AS n FROM pg_tables WHERE schemaname = 'qualification'`,
    );
    expect(c).toEqual([{ n: 0n }]);
    const other = client(at(ADMIN_TEMPLATE, "project_notapid"));
    const n = await tryQuery<{ n: bigint }>(
      other,
      `SELECT count(*) AS n FROM pg_tables WHERE schemaname = 'qualification'`,
    );
    expect(n).toEqual([{ n: 0n }]);
    expect(first.status).toBe(0);
  });

  it("I3.6 run again it changes nothing and exits 0", async () => {
    const before = await migrations(A);
    const again = migrateProjects();
    expect(again.status, again.out.slice(-800)).toBe(0);
    expect(await migrations(A)).toEqual(before);
  }, 300_000);

  it("I3.6 exits 2 on a permanent error (a database whose qualification schema it may not write)", async () => {
    const D = "dddddddd-0000-4000-8000-00000000000d";
    const su = client(at(ADMIN_TEMPLATE, "platform"));
    await su.$executeRawUnsafe(
      `DROP DATABASE IF EXISTS ${dbName(D)} WITH (FORCE)`,
    );
    await su.$executeRawUnsafe(`CREATE DATABASE ${dbName(D)}`);
    const d = client(at(ADMIN_TEMPLATE, dbName(D)));
    await d.$executeRawUnsafe(
      `REVOKE ALL ON DATABASE ${dbName(D)} FROM PUBLIC`,
    );
    await d.$executeRawUnsafe(
      `GRANT CONNECT ON DATABASE ${dbName(D)} TO qualification_rw`,
    );
    await d.$executeRawUnsafe(`CREATE SCHEMA qualification`); // owned by the superuser, no CREATE for the role
    await d.$disconnect();
    try {
      const run = migrateProjects();
      expect(run.status, run.out.slice(-800)).toBe(2);
    } finally {
      await su.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS ${dbName(D)} WITH (FORCE)`,
      );
    }
  }, 300_000);
});

// The schema of a project database equals the live one, minus project_id

type Line = { k: string };

async function shape(c: PrismaClient, live: boolean): Promise<string[]> {
  const q = async (sql: string) =>
    ((await c.$queryRawUnsafe<Line[]>(sql)) ?? []).map((r) => r.k);
  const cols = await q(`
    SELECT format('column %s.%s %s notnull=%s default=%s', c.relname, a.attname,
                  format_type(a.atttypid, a.atttypmod), a.attnotnull, coalesce(pg_get_expr(d.adbin, d.adrelid), '-')) AS k
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE n.nspname = 'qualification' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped`);
  const cons = await q(`
    SELECT format('constraint %s.%s %s', c.relname, k.conname, pg_get_constraintdef(k.oid)) AS k
      FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'qualification'`);
  const idx = await q(`
    SELECT format('index %s', indexdef) AS k FROM pg_indexes WHERE schemaname = 'qualification'`);
  const trg = await q(`
    SELECT format('trigger %s', pg_get_triggerdef(t.oid)) AS k
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'qualification' AND NOT t.tgisinternal`);
  const fns = await q(`
    SELECT format('function %s(%s) %s %s', p.proname, pg_get_function_arguments(p.oid),
                  pg_get_function_result(p.oid), CASE WHEN p.proname = 'card_is_latest' THEN '<body checked apart>' ELSE p.prosrc END) AS k
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'qualification'`);
  let lines = [...cols, ...cons, ...idx, ...trg, ...fns];
  const formsLine =
    /\bform(_version|_question|_version_question)?\b|form_version_id|form_(name|builtin|question_identity|version)_is_|form_version_question_is/;
  // The forms tables are not compared here. The live shape holds the one-level forms
  // (form, form_version, ...) of 20260925120000; a project database is at
  // 20260925150000_two_level_forms, which replaces them by question sets and questionnaires.
  // Those are pinned by their own tests (twoLevelForms.db.test.ts, projectForms.db.test.ts).
  const twoLevelLine =
    /\bquestion(naire)?(_set)?(_version)?(_item)?\b|questionnaire_version_id|question(naire)?(_set)?(_version)?(_item)?_is_|question_identity_is_fixed|questionnaire_row_is_fixed|question_set_row_is_fixed/;
  // The forms migration also replaces the answers' unique index (qualificationId, questionId)
  // by (qualificationId, toolId, questionId): both sides of that swap are the forms work's.
  const formsIndex =
    /qualification_answer_qualification_id_tool_id_question_id_key|"QualificationAnswer_qualificationId_questionId_key"/;
  // The Components block (20260929000000_system_components) is newer than the live shape: its
  // table, triggers, functions and card_component's component_key are pinned by
  // systemComponents.db.test.ts, not here.
  const componentsLine =
    /qualification_component|system_component_only_latest_changes|card_component_part_is_on_the_card|card_component_test_material_is_no_part|\bcomponent_key\b/;
  lines = lines.filter((l) => !componentsLine.test(l));
  // The VAIR terms (20260930000000_vair_terms) are newer too: nullable columns only, pinned
  // by the VAIR block of systemComponents.db.test.ts.
  const vairLine =
    /^column qualification\.(system_type|purpose|provider_term|deployer_term) |^column qualification_risk\.(source_term|consequence_term|impact_term|control_term|follow_up_control_term) /;
  lines = lines.filter((l) => !vairLine.test(l));
  // A card's history (20261003000000_ledger_history) is newer as well: its table, index,
  // trigger and function are pinned by ledger.db.test.ts.
  lines = lines.filter((l) => !/card_history/.test(l));
  if (!formsOnBranch)
    lines = lines.filter((l) => !formsLine.test(l) && !formsIndex.test(l));
  else lines = lines.filter((l) => !formsLine.test(l) && !twoLevelLine.test(l));
  if (live) {
    lines = lines
      // project_id, its index and the keys to core go
      .filter((l) => !/\bproject_id\b/.test(l))
      .filter((l) => !/REFERENCES core\.project\b/.test(l))
      // the key to the card version is to project.system in the same database
      .map((l) => l.replace(/\bcore\.system\b/g, "project.system"));
  }
  return lines.map((l) => l.replace(/\s+/g, " ").trim()).sort();
}

describe.skipIf(!enabled)(
  "I3.5 I3.7 a project database's qualification schema is the live one minus project_id",
  () => {
    let why = "";
    beforeAll(async () => {
      why = await ensureMigrated(A);
    }, 300_000);

    it("I3.5 the baseline is applied first, then the forms migrations (when on the branch), and nothing that names core", async () => {
      expect(why).toBe("");
      const names = await migrations(A);
      expect(Array.isArray(names) ? names[0] : names).toBe(BASELINE);
      if (formsOnBranch)
        expect(names).toEqual(
          expect.arrayContaining([...FORMS, READERS_READ_FORMS]),
        );
      const dirs = readdirSync(MIGRATIONS).filter((d) => /^\d{14}_/.test(d));
      expect(names).toEqual([...dirs].sort());
    });

    it("I3.7 tables, columns, types, defaults, NOT NULL, checks, keys, indexes, triggers and function bodies equal the live shape", async () => {
      expect(why).toBe("");
      const target = await shape(admin(A), false);
      const live = await shape(client(at(ADMIN_TEMPLATE, "live_shape")), true);
      const missing = live.filter((l) => !target.includes(l));
      const extra = target.filter((l) => !live.includes(l));
      expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    });

    it("I1.6 I3.5 qualification_system_id_fkey references project.system(pid) ON DELETE CASCADE, and no key leaves the database", async () => {
      expect(why).toBe("");
      const rows = await tryQuery<{ target: string; del: string }>(
        admin(A),
        `SELECT confrelid::regclass::text AS target, confdeltype::text AS del
         FROM pg_constraint WHERE conname = 'qualification_system_id_fkey'`,
      );
      expect(rows).toEqual([{ target: "project.system", del: "c" }]);
      const outside = await tryQuery<{ k: string }>(
        admin(A),
        `SELECT conname AS k FROM pg_constraint k JOIN pg_namespace n ON n.oid = k.connamespace
        WHERE n.nspname = 'qualification' AND k.contype = 'f'
          AND confrelid::regclass::text NOT LIKE 'qualification.%' AND confrelid::regclass::text <> 'project.system'`,
      );
      expect(outside).toEqual([]);
    });

    it("I1.7 qualification.qualification has no project_id column", async () => {
      expect(why).toBe("");
      const rows = await tryQuery<{ n: bigint }>(
        admin(A),
        `SELECT count(*) AS n FROM information_schema.columns
        WHERE table_schema = 'qualification' AND table_name = 'qualification' AND column_name = 'project_id'`,
      );
      expect(rows).toEqual([{ n: 0n }]);
    });

    it("I3.5 card_is_latest reads project.system (max(number) over the table) and never core", async () => {
      expect(why).toBe("");
      const rows = await tryQuery<{ src: string }>(
        admin(A),
        `SELECT p.prosrc AS src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'qualification' AND p.proname = 'card_is_latest'`,
      );
      expect(Array.isArray(rows) && rows.length === 1, String(rows)).toBe(true);
      const src = (rows as { src: string }[])[0].src;
      expect(src).toMatch(/project\.system/);
      expect(src).toMatch(/max\s*\(\s*\w*\.?number\s*\)/i);
      expect(src).not.toMatch(/\bcore\./);
      expect(src).not.toMatch(/project_id/);
    });
  },
);

// The rules, in a real project database

const card = (id: string, systemId: string) => `
  INSERT INTO qualification.qualification (id, system_id, "systemName", "systemVersion", company,
    description, "targetUseCase", "targetUsers", updated_at)
  VALUES ('${id}', '${systemId}', 'MCAS', '1', 'LIST', 'd', 'u', 't', now())`;

describe.skipIf(!enabled)(
  "I1.5 I1.6 I3.5 I16.5 cards and versions in a project database",
  () => {
    let why = "";
    const V1 = "a1a1a1a1-0000-4000-8000-000000000001";
    const V2 = "a1a1a1a1-0000-4000-8000-000000000002";
    let app: PrismaClient;
    beforeAll(async () => {
      why = await ensureMigrated(A);
      if (!why) why = await ensureMigrated(B);
      app = client(at(TEMPLATE, dbName(A)));
    }, 300_000);

    it("I1.5 I3.5 card_is_latest answers from project.system: only the highest number is the latest", async () => {
      expect(why).toBe("");
      const su = admin(A);
      await su.$executeRawUnsafe(
        `INSERT INTO project.system (pid, number, name) VALUES ('${V1}', 1, 'MCAS'), ('${V2}', 2, 'MCAS') ON CONFLICT DO NOTHING`,
      );
      const rows = await app.$queryRawUnsafe<{ v1: boolean; v2: boolean }[]>(
        `SELECT qualification.card_is_latest('${V1}'::uuid) AS v1, qualification.card_is_latest('${V2}'::uuid) AS v2`,
      );
      expect(rows).toEqual([{ v1: false, v2: true }]);
    });

    it("I1.6 a card naming a version absent from project.system is refused", async () => {
      expect(why).toBe("");
      const err = await app
        .$executeRawUnsafe(
          card("card-dangling", "99999999-0000-4000-8000-000000000009"),
        )
        .catch((e) => e);
      expect(String(err)).toMatch(/qualification_system_id_fkey|foreign key/i);
    });

    it("I3.5 the only-latest trigger still refuses a change to an older version's card", async () => {
      expect(why).toBe("");
      await app.$executeRawUnsafe(
        `${card("card-v1", V1)} ON CONFLICT DO NOTHING`,
      );
      const err = await app
        .$executeRawUnsafe(
          `UPDATE qualification.qualification SET company = 'x' WHERE id = 'card-v1'`,
        )
        .catch((e) => e);
      expect(String(err)).toMatch(/latest|older/i);
    });

    it("I16.5 a card in A's database is not in B's", async () => {
      expect(why).toBe("");
      await app.$executeRawUnsafe(
        `${card("card-of-a", V2)} ON CONFLICT DO NOTHING`,
      );
      const b = client(at(TEMPLATE, dbName(B)));
      const rows = await b.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM qualification.qualification WHERE id = 'card-of-a'`,
      );
      expect(rows).toEqual([{ n: 0n }]);
    });

    it("I1.6 deleting a version takes its card with it (ON DELETE CASCADE)", async () => {
      expect(why).toBe("");
      await app.$executeRawUnsafe(
        `${card("card-v1", V1)} ON CONFLICT DO NOTHING`,
      );
      await admin(A).$executeRawUnsafe(
        `DELETE FROM project.system WHERE pid = '${V1}'`,
      );
      const rows = await app.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM qualification.qualification WHERE id = 'card-v1'`,
      );
      expect(rows).toEqual([{ n: 0n }]);
    });
  },
);

// Reader grants inside the project database

describe.skipIf(!enabled)(
  "I2.6 report_ro and dashboard_ro read exactly the listed qualification tables",
  () => {
    let why = "";
    beforeAll(async () => {
      why = await ensureMigrated(A);
    }, 300_000);

    const readable = [
      "qualification",
      "qualification_answer",
      "qualification_risk",
      "knowledge_graph",
      "card_component",
      ...(formsOnBranch
        ? [
            "question_set",
            "question_set_version",
            "question_set_version_item",
            "question",
            "questionnaire",
            "questionnaire_version",
            "questionnaire_version_item",
          ]
        : []),
    ];

    it.each(["report_ro", "dashboard_ro"])(
      "I2.6 %s: SELECT on every listed table, nothing on _prisma_migrations, no writes",
      async (role) => {
        expect(why).toBe("");
        const su = admin(A);
        const rows = await su.$queryRawUnsafe<
          { t: string; sel: boolean; ins: boolean }[]
        >(
          `SELECT c.relname AS t,
              has_table_privilege('${role}', c.oid, 'SELECT') AS sel,
              has_table_privilege('${role}', c.oid, 'INSERT,UPDATE,DELETE') AS ins
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'qualification' AND c.relkind = 'r' ORDER BY 1`,
        );
        const got = Object.fromEntries(rows.map((r) => [r.t, r.sel]));
        for (const t of readable)
          expect(got[t], `${role} SELECT qualification.${t}`).toBe(true);
        expect(
          got["_prisma_migrations"],
          `${role} must not read _prisma_migrations`,
        ).toBe(false);
        expect(rows.filter((r) => r.ins).map((r) => r.t)).toEqual([]);
        const schema = await su.$queryRawUnsafe<{ u: boolean }[]>(
          `SELECT has_schema_privilege('${role}', 'qualification', 'USAGE') AS u`,
        );
        expect(schema).toEqual([{ u: true }]);
      },
    );
  },
);

// A dropped project database is evicted and answers 404

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ authorization: "Bearer person-token" }),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw Object.assign(new Error("NEXT_NOT_FOUND"), {
      digest: "NEXT_NOT_FOUND",
    });
  },
}));

describe.skipIf(!enabled)(
  "I2.5 I17.1 projectDb.ts after the project's database is dropped",
  () => {
    type ProjectDb = {
      projectDbFor: (
        pid: string,
        o: { write: boolean },
      ) => Promise<PrismaClient>;
      isMissingDatabase: (err: unknown) => boolean;
    };

    it("I2.5 the first error after the drop is recognised, the client is evicted, and the pid is then 404 (not 500)", async () => {
      const file = join(APP, "src", "lib", "projectDb.ts");
      expect(existsSync(file), "I3.1: src/lib/projectDb.ts").toBe(true);
      process.env.PROJECT_DATABASE_URL = TEMPLATE;
      process.env.PLATFORM_URL = "http://platform.invalid";
      const realFetch = globalThis.fetch;
      globalThis.fetch = (async () =>
        new Response(
          JSON.stringify({ role: "editor", admin: false, may_write: true }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        )) as typeof fetch;
      try {
        const m = (await import(/* @vite-ignore */ file)) as ProjectDb;
        const c1 = await m.projectDbFor(E, { write: false });
        await c1.$queryRawUnsafe(`SELECT 1`);
        await client(at(ADMIN_TEMPLATE, "platform")).$executeRawUnsafe(
          `DROP DATABASE IF EXISTS ${dbName(E)} WITH (FORCE)`,
        );
        const err = await c1.$queryRawUnsafe(`SELECT 1`).catch((e) => e);
        expect(
          m.isMissingDatabase(err),
          `I2.5: recognised: ${String(err)}`,
        ).toBe(true);
        const next = await m
          .projectDbFor(E, { write: false })
          .then((c) => c.$queryRawUnsafe(`SELECT 1`))
          .catch((e) => e);
        expect(
          (next as { digest?: string })?.digest,
          `I2.5: evicted, then 404 (not 500): ${String(next)}`,
        ).toBe("NEXT_NOT_FOUND");
      } finally {
        globalThis.fetch = realFetch;
      }
    }, 300_000);
  },
);
