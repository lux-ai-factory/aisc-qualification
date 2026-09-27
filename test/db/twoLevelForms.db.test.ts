import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { loadSrc } from "../support/forms";

// Two-level forms (docs/superpowers/two-level-forms-2026-09-25/01-spec.md): the forward migration
// 20260925150000_two_level_forms in a real Postgres. Replaces test/db/forms.db.test.ts (spec 8.2):
// its R1 seed, R5 answer index, R6 triggers, R45 builtin rules and R7 no-history cases are
// re-expressed here on the new tables (T3 to T9).
//
//   T3        a fresh install: the builtin set and the default questionnaire, equal to the twins
//   T4 to T6  triggers and constraints of spec 3.1 and 3.2
//   T7        answer keys unchanged; the card's key into questionnaire_version
//   T8, T9    the split, run by psql inside BEGIN ... ROLLBACK on a database put back to the
//             state of live (every migration up to and including 20260925120000), then seeded
//   live      the exact state of live (builtin form only, one card with form_version_id NULL
//             and 14 answers, its graph and card JSON): answers, graph digest and card JSON are
//             byte-identical after, and the new rows are exactly the builtin level
//   aborts    a tampered builtin form, a count check that fails, data breaking a new CHECK
//
// Runs only against a throwaway database: test/db/throwaway-db.sh starts one, migrates it with
// `prisma migrate deploy` (so the new migration is already applied when these run) and sets the
// three variables. Never the live DB: ports 5432 and 5433 (the running stack's) are refused.

const APP_URL = process.env.QUALIFICATION_TEST_DATABASE_URL ?? "";
const ADMIN_URL = process.env.QUALIFICATION_TEST_ADMIN_URL ?? "";
const PSQL = process.env.QUALIFICATION_TEST_PSQL ?? "";
const enabled = APP_URL !== "" && ADMIN_URL !== "";
if (enabled && [APP_URL, ADMIN_URL].some((u) => /:543[23]\//.test(u))) {
  throw new Error("refusing to run the DB tests against port 5432 or 5433 (the running stack)");
}

const MIGRATION = "prisma/migrations/20260925150000_two_level_forms/migration.sql";
const FORMS_ARE_DATA = "prisma/migrations/20260925090000_forms_are_data/migration.sql";
const DEFAULT_IS_FIXED = "prisma/migrations/20260925120000_the_default_form_is_fixed/migration.sql";

const ALL_BLOCKS = [
  "description", "targetUseCase", "targetUsers", "intendedDeployers", "targetSystemTags",
  "sectorTags", "marketFormTags", "localityTags", "risks",
];
const ANNEX_IDS = ["1a", "1b", "1c", "1de", "1f", "1gh", "2a", "2b", "2c", "2d", "2e", "2f", "2g", "2h"];
const NEW_TABLES = [
  "question_set", "question_set_version", "question", "question_set_version_item",
  "questionnaire", "questionnaire_version", "questionnaire_version_item",
];
const NEW_TRIGGERS = [
  "question_identity_is_fixed",
  "question_set_row_is_fixed",
  "question_set_version_is_allowed",
  "question_set_version_is_append_only",
  "question_set_version_item_is_append_only",
  "question_set_version_item_is_of_its_set",
  "questionnaire_row_is_fixed",
  "questionnaire_version_is_allowed",
  "questionnaire_version_is_append_only",
  "questionnaire_version_item_is_append_only",
];
const HISTORY = ["qualification", "qualification_answer", "qualification_risk", "knowledge_graph", "card_component"];

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

/** Run a psql script (as the superuser of the throwaway DB); exit status, stdout and stderr. */
function psql(script: string): { ok: boolean; out: string; err: string } {
  expect(PSQL).not.toBe("");
  const r = spawnSync(PSQL, { shell: true, input: script, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.stdout ?? "", err: r.stderr ?? "" };
}

/** Run SQL inside a transaction that is rolled back; "" when it succeeded, else psql's stderr. */
function rolledBack(statements: string): string {
  const r = psql(`BEGIN;\n${statements};\nROLLBACK;`);
  return r.ok ? "" : r.err;
}

/** The one line a script printed as `<tag> <json>`, parsed. */
function result<T>(out: string, tag: string): T {
  const line = out.split("\n").find((l) => l.startsWith(`${tag} `));
  expect(line, `the script printed no ${tag} line; stdout was:\n${out.slice(0, 2000)}`).toBeDefined();
  return JSON.parse(line!.slice(tag.length + 1)) as T;
}

/** SQL string literal. */
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const blocks = (b: string[]) => (b.length ? `ARRAY[${b.map(lit).join(",")}]::text[]` : "ARRAY[]::text[]");

/** A project with one card version holding a card (the latest, so it may change). Raw SQL, no client model. */
async function projectWithACard() {
  const project = randomUUID();
  const v1 = randomUUID();
  const card = `c-${randomUUID().slice(0, 8)}`;
  await admin.$executeRawUnsafe(
    `INSERT INTO project.system (pid, name, version, number) VALUES ('${v1}', 'MCAS', '1', (SELECT coalesce(max(number), 0) + 1 FROM project.system))`,
  );
  await app.$executeRawUnsafe(
    `INSERT INTO qualification.qualification (id, system_id, "systemName", "systemVersion", company,
       description, "targetUseCase", "targetUsers", updated_at)
     VALUES ('${card}', '${v1}', 'MCAS', '1', 'LIST', 'd', 'u', 't', now())`,
  );
  return { project, v1, card };
}

// ─────────────────────────────────────────────────────────────────────────────
// T3: a fresh install
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!enabled)("a fresh install has the builtin set and the default questionnaire (T3)", () => {
  it("T3 the migration file exists and is recorded as applied", async () => {
    expect(existsSync(MIGRATION)).toBe(true);
    const rows = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM qualification._prisma_migrations
        WHERE migration_name = '20260925150000_two_level_forms' AND finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    expect(Number(rows[0].n)).toBe(1);
  });

  it("T3 QuestionnaireService.resolve('annex-iv-default-v1') with the real repository deep-equals annexDefaultVersion()", async () => {
    const { annexDefaultVersion } = await loadSrc("domain/forms/legacy.ts");
    const { QuestionnaireRepository } = await loadSrc("server/repositories/QuestionnaireRepository.ts");
    const { QuestionnaireService } = await loadSrc("server/services/QuestionnaireService.ts");
    const service = new QuestionnaireService(new QuestionnaireRepository(app));
    expect(await service.resolve("annex-iv-default-v1")).toEqual(annexDefaultVersion());
  });

  it("T3 QuestionSetService.resolveSetVersion('annex-iv-v1') with the real repository deep-equals annexSetVersion()", async () => {
    const { annexSetVersion } = await loadSrc("domain/forms/legacy.ts");
    const { QuestionSetRepository } = await loadSrc("server/repositories/QuestionSetRepository.ts");
    const { QuestionSetService } = await loadSrc("server/services/QuestionSetService.ts");
    const service = new QuestionSetService(new QuestionSetRepository(app));
    expect(await service.resolveSetVersion("annex-iv-v1")).toEqual(annexSetVersion());
  });

  it("T3 the builtin rows: set annex-iv v1 and questionnaire annex-iv-default v1, made by system", async () => {
    const set = await admin.$queryRawUnsafe<unknown[]>(
      `SELECT id, name, description, origin, retired_at, created_by FROM qualification.question_set WHERE origin = 'builtin'`,
    );
    expect(set).toEqual([
      {
        id: "annex-iv", name: "Annex IV", description: "EU AI Act Annex IV points 1 and 2, as 14 questions.",
        origin: "builtin", retired_at: null, created_by: "system",
      },
    ]);
    const setVersion = await admin.$queryRawUnsafe<unknown[]>(
      `SELECT id, number, created_by FROM qualification.question_set_version WHERE set_id = 'annex-iv'`,
    );
    expect(setVersion).toEqual([{ id: "annex-iv-v1", number: 1, created_by: "system" }]);
    const questionnaire = await admin.$queryRawUnsafe<unknown[]>(
      `SELECT id, name, description, origin, listed, retired_at, created_by FROM qualification.questionnaire WHERE origin = 'builtin'`,
    );
    expect(questionnaire).toEqual([
      {
        id: "annex-iv-default", name: "Annex IV default",
        description: "EU AI Act Annex IV points 1 and 2, as 14 questions.",
        origin: "builtin", listed: true, retired_at: null, created_by: "system",
      },
    ]);
    const version = await admin.$queryRawUnsafe<unknown[]>(
      `SELECT id, number, blocks, created_by FROM qualification.questionnaire_version WHERE questionnaire_id = 'annex-iv-default'`,
    );
    expect(version).toEqual([{ id: "annex-iv-default-v1", number: 1, blocks: ALL_BLOCKS, created_by: "system" }]);
  });

  it("T3 annex-iv-v1's 14 wording rows, in position order, are annexDefaultVersion().questions field by field", async () => {
    const { annexDefaultVersion } = await loadSrc("domain/forms/legacy.ts");
    const rows = await admin.$queryRawUnsafe<unknown[]>(
      `SELECT i.question_id, q.scope, q.local_id, q.set_id, i.position, i.text, i.citation, i.required,
              i.annex_point, i.group_label
         FROM qualification.question_set_version_item i
         JOIN qualification.question q ON q.id = i.question_id
        WHERE i.set_version_id = 'annex-iv-v1'
        ORDER BY i.position`,
    );
    const expected = annexDefaultVersion().questions.map(
      (q: { questionId: string; scope: string; localId: string; text: string; citation: string; required: boolean; annexPoint: string; groupLabel: string }, i: number) => ({
        question_id: q.questionId, scope: q.scope, local_id: q.localId, set_id: "annex-iv", position: i,
        text: q.text, citation: q.citation, required: q.required, annex_point: q.annexPoint, group_label: q.groupLabel,
      }),
    );
    expect(rows).toEqual(expected);
    expect(rows.map((r) => (r as { question_id: string }).question_id)).toEqual(ANNEX_IDS.map((id) => `annex-iv-${id}`));
  });

  it("T3 annex-iv-default-v1 has 14 items, in the same order, all pinned to annex-iv-v1", async () => {
    const rows = await admin.$queryRawUnsafe<unknown[]>(
      `SELECT position, set_version_id, question_id FROM qualification.questionnaire_version_item
        WHERE questionnaire_version_id = 'annex-iv-default-v1' ORDER BY position`,
    );
    expect(rows).toEqual(
      ANNEX_IDS.map((id, position) => ({ position, set_version_id: "annex-iv-v1", question_id: `annex-iv-${id}` })),
    );
  });

  it("T3 no table form, form_version, form_question or form_version_question exists, and no old trigger function", async () => {
    const rows = await admin.$queryRawUnsafe<{ t: boolean }[]>(
      `SELECT to_regclass(x) IS NOT NULL AS t FROM unnest(ARRAY['qualification.form','qualification.form_version',
         'qualification.form_question','qualification.form_version_question']) AS x`,
    );
    expect(rows).toEqual([{ t: false }, { t: false }, { t: false }, { t: false }]);
    const fns = await admin.$queryRawUnsafe<{ proname: string }[]>(
      `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'qualification' AND p.proname IN ('form_version_is_append_only',
          'form_version_question_is_append_only','form_question_identity_is_fixed','form_name_is_fixed','form_builtin_is_fixed')`,
    );
    expect(fns).toEqual([]);
  });

  it("T3 the seven tables exist, with the ten triggers of spec 3.2", async () => {
    const tables = await admin.$queryRawUnsafe<{ t: boolean }[]>(
      `SELECT to_regclass('qualification.' || x) IS NOT NULL AS t FROM unnest(ARRAY[${NEW_TABLES.map(lit).join(",")}]) AS x`,
    );
    expect(tables.map((r) => r.t)).toEqual(NEW_TABLES.map(() => true));
    const triggers = await admin.$queryRawUnsafe<{ tgname: string }[]>(
      `SELECT DISTINCT tgname FROM pg_trigger
        WHERE NOT tgisinternal AND tgrelid IN (SELECT c.oid FROM pg_class c
          WHERE c.relnamespace = 'qualification'::regnamespace AND c.relname IN (${NEW_TABLES.map(lit).join(",")}))
        ORDER BY tgname`,
    );
    expect(triggers.map((t) => t.tgname)).toEqual(NEW_TRIGGERS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T4 to T6: triggers and constraints (every write rolled back)
// ─────────────────────────────────────────────────────────────────────────────

/** A builder set `id` with v1 holding `id-q1` (scope s-<id>), and questionnaire `id` v1 pinning it. */
const smallLibrary = (id: string) => `
  INSERT INTO qualification.question_set (id, name, origin, created_by) VALUES ('${id}', 'Set ${id}', 'builder', 'alice');
  INSERT INTO qualification.question (id, set_id, scope, local_id) VALUES ('${id}-q1', '${id}', 's-${id}', 'q1');
  INSERT INTO qualification.question_set_version (id, set_id, number, created_by) VALUES ('${id}-v1', '${id}', 1, 'alice');
  INSERT INTO qualification.question_set_version_item (set_version_id, question_id, position, text, required)
    VALUES ('${id}-v1', '${id}-q1', 0, 'Who signs off?', true);
  INSERT INTO qualification.questionnaire (id, name, origin, created_by) VALUES ('${id}', 'Questionnaire ${id}', 'builder', 'alice');
  INSERT INTO qualification.questionnaire_version (id, questionnaire_id, number, blocks, created_by)
    VALUES ('${id}-qv1', '${id}', 1, ARRAY['risks'], 'alice');
  INSERT INTO qualification.questionnaire_version_item (questionnaire_version_id, position, set_version_id, question_id)
    VALUES ('${id}-qv1', 0, '${id}-v1', '${id}-q1')`;

const uid = () => `t${randomUUID().slice(0, 8)}`;

describe.skipIf(!enabled)("versions are append-only; identity is fixed (T4)", () => {
  it("T4 the small library the next tests use can be written (a set, a question, a version, a questionnaire)", () => {
    expect(rolledBack(smallLibrary(uid()))).toBe("");
  });

  it("T4 UPDATE or DELETE of a question_set_version raises 'question set version <id> is immutable'", () => {
    const id = uid();
    expect(rolledBack(`${smallLibrary(id)}; UPDATE qualification.question_set_version SET number = 9 WHERE id = '${id}-v1'`))
      .toContain(`question set version ${id}-v1 is immutable: save a new version instead`);
    expect(rolledBack(`${smallLibrary(id)}; DELETE FROM qualification.question_set_version WHERE id = '${id}-v1'`))
      .toContain(`question set version ${id}-v1 is immutable: save a new version instead`);
    expect(rolledBack(`UPDATE qualification.question_set_version SET created_by = 'x' WHERE id = 'annex-iv-v1'`))
      .toContain("question set version annex-iv-v1 is immutable: save a new version instead");
  });

  it("T4 UPDATE or DELETE of a question_set_version_item raises the same message with its set version id", () => {
    const id = uid();
    expect(rolledBack(`${smallLibrary(id)}; UPDATE qualification.question_set_version_item SET text = 'x' WHERE set_version_id = '${id}-v1'`))
      .toContain(`question set version ${id}-v1 is immutable: save a new version instead`);
    expect(rolledBack(`DELETE FROM qualification.question_set_version_item WHERE set_version_id = 'annex-iv-v1'`))
      .toContain("question set version annex-iv-v1 is immutable: save a new version instead");
  });

  it("T4 UPDATE or DELETE of a questionnaire_version raises 'questionnaire version <id> is immutable'", () => {
    expect(rolledBack(`UPDATE qualification.questionnaire_version SET blocks = ARRAY[]::text[] WHERE id = 'annex-iv-default-v1'`))
      .toContain("questionnaire version annex-iv-default-v1 is immutable: save a new version instead");
    const id = uid();
    expect(rolledBack(`${smallLibrary(id)}; DELETE FROM qualification.questionnaire_version_item WHERE questionnaire_version_id = '${id}-qv1';
                       DELETE FROM qualification.questionnaire_version WHERE id = '${id}-qv1'`))
      .toContain(`questionnaire version ${id}-qv1 is immutable: save a new version instead`);
  });

  it("T4 UPDATE or DELETE of a questionnaire_version_item raises the same message with its version id", () => {
    expect(rolledBack(`UPDATE qualification.questionnaire_version_item SET position = 99 WHERE questionnaire_version_id = 'annex-iv-default-v1'`))
      .toContain("questionnaire version annex-iv-default-v1 is immutable: save a new version instead");
    expect(rolledBack(`DELETE FROM qualification.questionnaire_version_item WHERE questionnaire_version_id = 'annex-iv-default-v1'`))
      .toContain("questionnaire version annex-iv-default-v1 is immutable: save a new version instead");
  });

  it("T4 a question's local_id, scope, set_id or created_at cannot change, and a question cannot be deleted", () => {
    const fixed = "question annex-iv-1a keeps its identity: set, scope and local id are fixed";
    expect(rolledBack(`UPDATE qualification.question SET local_id = 'zz' WHERE id = 'annex-iv-1a'`)).toContain(fixed);
    expect(rolledBack(`UPDATE qualification.question SET scope = 's-x' WHERE id = 'annex-iv-1a'`)).toContain(fixed);
    expect(rolledBack(`UPDATE qualification.question SET created_at = now() - interval '1 day' WHERE id = 'annex-iv-1a'`)).toContain(fixed);
    const id = uid();
    expect(rolledBack(`${smallLibrary(id)}; UPDATE qualification.question SET set_id = 'annex-iv' WHERE id = '${id}-q1'`))
      .toContain(`question ${id}-q1 keeps its identity: set, scope and local id are fixed`);
    expect(rolledBack(`DELETE FROM qualification.question WHERE id = 'annex-iv-1a'`))
      .toContain("question annex-iv-1a cannot be deleted: versions refer to it");
    // a question in no version yet: still refused, the trigger comes first
    expect(rolledBack(`INSERT INTO qualification.question (id, set_id, scope, local_id) VALUES ('${id}-lone', 'annex-iv', 's-${id}', 'q9');
                       DELETE FROM qualification.question WHERE id = '${id}-lone'`))
      .toContain(`question ${id}-lone cannot be deleted: versions refer to it`);
  });

  it("T4 a set item whose question belongs to another set is refused by question_set_version_item_is_of_its_set", () => {
    const id = uid();
    const err = rolledBack(`${smallLibrary(id)};
      INSERT INTO qualification.question_set_version_item (set_version_id, question_id, position, text, required)
        VALUES ('${id}-v1', 'annex-iv-2a', 1, 'Borrowed?', true)`);
    expect(err).toContain(`question annex-iv-2a is not a question of the set of version ${id}-v1`);
  });

  it("T4 a questionnaire item naming no set item fails on questionnaire_version_item_set_item_fkey", () => {
    const id = uid();
    // annex-iv-2a is a question, but not an item of <id>-v1
    const err = rolledBack(`${smallLibrary(id)};
      INSERT INTO qualification.questionnaire_version_item (questionnaire_version_id, position, set_version_id, question_id)
        VALUES ('${id}-qv1', 1, '${id}-v1', 'annex-iv-2a')`);
    expect(err).toMatch(/violates foreign key constraint "questionnaire_version_item_set_item_fkey"/);
  });

  it("T4 the same question twice in one questionnaire version fails on the primary key", () => {
    const id = uid();
    const err = rolledBack(`${smallLibrary(id)};
      INSERT INTO qualification.questionnaire_version (id, questionnaire_id, number, blocks, created_by)
        VALUES ('${id}-qv2', '${id}', 2, ARRAY[]::text[], 'bob');
      INSERT INTO qualification.questionnaire_version_item (questionnaire_version_id, position, set_version_id, question_id)
        VALUES ('${id}-qv2', 0, 'annex-iv-v1', 'annex-iv-2a'), ('${id}-qv2', 1, 'annex-iv-v1', 'annex-iv-2a')`);
    expect(err).toMatch(/violates unique constraint "questionnaire_version_item_pkey"/);
  });

  it("T4 a questionnaire may pick from the builtin set and from another set in one version", () => {
    const id = uid();
    expect(
      rolledBack(`${smallLibrary(id)};
        INSERT INTO qualification.questionnaire_version (id, questionnaire_id, number, blocks, created_by)
          VALUES ('${id}-qv2', '${id}', 2, ARRAY[]::text[], 'bob');
        INSERT INTO qualification.questionnaire_version_item (questionnaire_version_id, position, set_version_id, question_id)
          VALUES ('${id}-qv2', 0, 'annex-iv-v1', 'annex-iv-2a'), ('${id}-qv2', 1, '${id}-v1', '${id}-q1')`),
    ).toBe("");
  });

  it("T4 the checks of 3.1: an unknown block, an Annex point outside the 14, a bad scope, an origin, blank created_by", () => {
    const id = uid();
    expect(rolledBack(`${smallLibrary(id)}; INSERT INTO qualification.questionnaire_version (id, questionnaire_id, number, blocks, created_by)
      VALUES ('${id}-qv2', '${id}', 2, ARRAY['colour'], 'bob')`)).toMatch(/questionnaire_version_blocks_check/);
    expect(rolledBack(`${smallLibrary(id)}; INSERT INTO qualification.question_set_version (id, set_id, number, created_by) VALUES ('${id}-v2', '${id}', 2, 'bob');
      INSERT INTO qualification.question_set_version_item (set_version_id, question_id, position, text, required, annex_point)
      VALUES ('${id}-v2', '${id}-q1', 0, 'Q?', true, '3a')`)).toMatch(/question_set_version_item_annex_point_check/);
    expect(rolledBack(`${smallLibrary(id)}; INSERT INTO qualification.question (id, set_id, scope, local_id) VALUES ('${id}-bad', '${id}', 'S_BAD', 'q2')`))
      .toMatch(/question_scope_check/);
    expect(rolledBack(`INSERT INTO qualification.question_set (id, name, origin, created_by) VALUES ('${id}', 'X ${id}', 'magic', 'a')`))
      .toMatch(/question_set_origin_check/);
    expect(rolledBack(`INSERT INTO qualification.question_set (id, name, origin, created_by) VALUES ('${id}', 'X ${id}', 'builder', '  ')`))
      .toMatch(/question_set_created_by_length/);
    expect(rolledBack(`INSERT INTO qualification.questionnaire (id, name, origin, created_by) VALUES ('${id}', 'X ${id}', 'builder', '')`))
      .toMatch(/questionnaire_created_by_length/);
    expect(rolledBack(`${smallLibrary(id)}; INSERT INTO qualification.question_set_version (id, set_id, number, created_by) VALUES ('${id}-v2b', '${id}', 1, 'bob')`))
      .toMatch(/question_set_version_set_id_number_key/);
  });
});

describe.skipIf(!enabled)("the builtin rows are fixed and the default is not a flag (T5)", () => {
  it("T5 a second version of the builtin set or the default questionnaire is refused by the _is_allowed triggers", () => {
    expect(rolledBack(`INSERT INTO qualification.question_set_version (id, set_id, number, created_by) VALUES ('annex-iv-v2', 'annex-iv', 2, 'alice')`))
      .toContain("question set annex-iv is builtin: it has one version, made by a migration");
    expect(rolledBack(`INSERT INTO qualification.questionnaire_version (id, questionnaire_id, number, blocks, created_by)
      VALUES ('annex-iv-default-v2', 'annex-iv-default', 2, ARRAY[]::text[], 'alice')`))
      .toContain("questionnaire annex-iv-default is builtin: it has one version, made by a migration");
  });

  it("T5 a second builtin set or questionnaire fails on its CHECK", () => {
    const id = uid();
    expect(rolledBack(`INSERT INTO qualification.question_set (id, name, origin, created_by) VALUES ('${id}', 'Other ${id}', 'builtin', 'system')`))
      .toMatch(/violates check constraint "question_set_builtin_is_annex_iv"/);
    expect(rolledBack(`INSERT INTO qualification.questionnaire (id, name, origin, created_by) VALUES ('${id}', 'Other ${id}', 'builtin', 'system')`))
      .toMatch(/violates check constraint "questionnaire_builtin_is_the_default"/);
  });

  it("T5 retiring either builtin row fails on that CHECK", () => {
    expect(rolledBack(`UPDATE qualification.question_set SET retired_at = now() WHERE id = 'annex-iv'`))
      .toMatch(/violates check constraint "question_set_builtin_is_annex_iv"/);
    expect(rolledBack(`UPDATE qualification.questionnaire SET retired_at = now() WHERE id = 'annex-iv-default'`))
      .toMatch(/violates check constraint "questionnaire_builtin_is_the_default"/);
  });

  it("T5 the default questionnaire cannot be unlisted: the trigger names what is fixed", () => {
    expect(rolledBack(`UPDATE qualification.questionnaire SET listed = false WHERE id = 'annex-iv-default'`)).toContain(
      "questionnaire annex-iv-default keeps its name, origin, listing and author; it can only be retired, once",
    );
  });

  it("T5 the default questionnaire's description can change (rolled back)", () => {
    expect(rolledBack(`UPDATE qualification.questionnaire SET description = 'Changed in a test' WHERE id = 'annex-iv-default'`)).toBe("");
  });

  it("T5 neither new table has a default column or a one-default index", async () => {
    const cols = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM information_schema.columns
        WHERE table_schema = 'qualification' AND table_name IN ('question_set','questionnaire') AND column_name ILIKE '%default%'`,
    );
    expect(Number(cols[0].n)).toBe(0);
  });
});

describe.skipIf(!enabled)("retiring is one-way and frees the name (T6)", () => {
  it("T6 a builder set is retired once: setting retired_at again, or back to NULL, raises", () => {
    const id = uid();
    expect(rolledBack(`${smallLibrary(id)}; UPDATE qualification.question_set SET retired_at = now() WHERE id = '${id}'`)).toBe("");
    const once = `question set ${id} keeps its name, origin and author; it can only be retired, once`;
    expect(rolledBack(`${smallLibrary(id)}; UPDATE qualification.question_set SET retired_at = now() WHERE id = '${id}';
      UPDATE qualification.question_set SET retired_at = now() + interval '1 hour' WHERE id = '${id}'`)).toContain(once);
    expect(rolledBack(`${smallLibrary(id)}; UPDATE qualification.question_set SET retired_at = now() WHERE id = '${id}';
      UPDATE qualification.question_set SET retired_at = NULL WHERE id = '${id}'`)).toContain(once);
  });

  it("T6 a retired set gets no new version", () => {
    const id = uid();
    expect(rolledBack(`${smallLibrary(id)}; UPDATE qualification.question_set SET retired_at = now() WHERE id = '${id}';
      INSERT INTO qualification.question_set_version (id, set_id, number, created_by) VALUES ('${id}-v2', '${id}', 2, 'bob')`))
      .toContain(`question set ${id} is retired: it gets no new version`);
  });

  it("T6 a retired questionnaire gets no new version", () => {
    const id = uid();
    expect(rolledBack(`${smallLibrary(id)}; UPDATE qualification.questionnaire SET retired_at = now() WHERE id = '${id}';
      INSERT INTO qualification.questionnaire_version (id, questionnaire_id, number, blocks, created_by) VALUES ('${id}-qv2', '${id}', 2, ARRAY[]::text[], 'bob')`))
      .toContain(`questionnaire ${id} is retired: it gets no new version`);
  });

  it("T6 a set's name, origin, created_by and created_at are fixed; its description is not", () => {
    const id = uid();
    const fixed = `question set ${id} keeps its name, origin and author; it can only be retired, once`;
    for (const change of [`name = 'Renamed ${id}'`, `origin = 'import'`, `created_by = 'mallory'`, `created_at = now() - interval '1 day'`]) {
      expect(rolledBack(`${smallLibrary(id)}; UPDATE qualification.question_set SET ${change} WHERE id = '${id}'`), change).toContain(fixed);
    }
    expect(rolledBack(`${smallLibrary(id)}; UPDATE qualification.question_set SET description = 'Now described' WHERE id = '${id}'`)).toBe("");
  });

  it("T6 a questionnaire's name, origin, listing, created_by and created_at are fixed; its description is not", () => {
    const id = uid();
    const fixed = `questionnaire ${id} keeps its name, origin, listing and author; it can only be retired, once`;
    for (const change of [`name = 'Renamed ${id}'`, `origin = 'import'`, `listed = false`, `created_by = 'mallory'`, `created_at = now() - interval '1 day'`]) {
      expect(rolledBack(`${smallLibrary(id)}; UPDATE qualification.questionnaire SET ${change} WHERE id = '${id}'`), change).toContain(fixed);
    }
    expect(rolledBack(`${smallLibrary(id)}; UPDATE qualification.questionnaire SET description = 'Now described' WHERE id = '${id}'`)).toBe("");
    expect(rolledBack(`${smallLibrary(id)}; UPDATE qualification.questionnaire SET retired_at = now() WHERE id = '${id}';
      UPDATE qualification.questionnaire SET retired_at = NULL WHERE id = '${id}'`)).toContain(fixed);
  });

  it("T6 two active sets with one name in other case fail on question_set_active_name_key; after retiring the first, it is free", () => {
    const a = uid();
    const b = uid();
    const c = uid();
    expect(rolledBack(`INSERT INTO qualification.question_set (id, name, origin, created_by) VALUES ('${a}', 'Acme ${a}', 'builder', 'x');
      INSERT INTO qualification.question_set (id, name, origin, created_by) VALUES ('${b}', 'ACME ${a.toUpperCase()}', 'import', 'x')`))
      .toMatch(/violates unique constraint "question_set_active_name_key"/);
    expect(rolledBack(`INSERT INTO qualification.question_set (id, name, origin, created_by) VALUES ('${a}', 'Acme ${a}', 'builder', 'x');
      UPDATE qualification.question_set SET retired_at = now() WHERE id = '${a}';
      INSERT INTO qualification.question_set (id, name, origin, created_by) VALUES ('${b}', 'acme ${a}', 'builder', 'x');
      UPDATE qualification.question_set SET retired_at = now() WHERE id = '${b}';
      INSERT INTO qualification.question_set (id, name, origin, created_by) VALUES ('${c}', 'ACME ${a}', 'builder', 'x')`)).toBe("");
  });

  it("T6 listed questionnaires share the rule on questionnaire_listed_name_key; two unlisted ones may share a name", () => {
    const a = uid();
    const b = uid();
    expect(rolledBack(`INSERT INTO qualification.questionnaire (id, name, origin, created_by) VALUES ('${a}', 'Q ${a}', 'builder', 'x');
      INSERT INTO qualification.questionnaire (id, name, origin, created_by) VALUES ('${b}', 'q ${a}', 'builder', 'x')`))
      .toMatch(/violates unique constraint "questionnaire_listed_name_key"/);
    expect(rolledBack(`INSERT INTO qualification.questionnaire (id, name, origin, listed, created_by) VALUES ('${a}', 'Once ${a}', 'builder', false, 'x');
      INSERT INTO qualification.questionnaire (id, name, origin, listed, created_by) VALUES ('${b}', 'Once ${a}', 'builder', false, 'x')`)).toBe("");
    expect(rolledBack(`INSERT INTO qualification.questionnaire (id, name, origin, created_by) VALUES ('${a}', 'Q ${a}', 'builder', 'x');
      UPDATE qualification.questionnaire SET retired_at = now() WHERE id = '${a}';
      INSERT INTO qualification.questionnaire (id, name, origin, created_by) VALUES ('${b}', 'Q ${a}', 'builder', 'x')`)).toBe("");
  });

  it("T6 DELETE of a question_set or a questionnaire row raises: retire it instead", () => {
    const id = uid();
    expect(rolledBack(`INSERT INTO qualification.question_set (id, name, origin, created_by) VALUES ('${id}', 'Gone ${id}', 'builder', 'x');
      DELETE FROM qualification.question_set WHERE id = '${id}'`)).toContain(`question set ${id} cannot be deleted: retire it instead`);
    expect(rolledBack(`INSERT INTO qualification.questionnaire (id, name, origin, created_by) VALUES ('${id}', 'Gone ${id}', 'builder', 'x');
      DELETE FROM qualification.questionnaire WHERE id = '${id}'`)).toContain(`questionnaire ${id} cannot be deleted: retire it instead`);
    expect(rolledBack(`DELETE FROM qualification.questionnaire WHERE id = 'annex-iv-default'`))
      .toContain("questionnaire annex-iv-default cannot be deleted: retire it instead");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T7: answer keys and the card's key
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!enabled)("answer keys are unchanged; the card points at a questionnaire version (T7)", () => {
  it("T7 the same (qualification, toolId, questionId) twice fails; the same questionId under two scopes does not", async () => {
    const { card } = await projectWithACard();
    const answer = (id: string, toolId: string, text: string) =>
      app.$executeRawUnsafe(
        `INSERT INTO qualification.qualification_answer (id, "qualificationId", "toolId", "questionId", answer)
         VALUES ('${id}', '${card}', '${toolId}', 'q1', ${lit(text)})`,
      );
    await answer(`${card}-a1`, "s-ff", "F's q1");
    await answer(`${card}-a2`, "s-gg", "G's q1");
    await expect(answer(`${card}-a3`, "s-ff", "again")).rejects.toThrow(
      /qualification_answer_qualification_id_tool_id_question_id_key|unique|23505/i,
    );
    const idx = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM pg_indexes WHERE schemaname = 'qualification'
         AND indexname = 'qualification_answer_qualification_id_tool_id_question_id_key'`,
    );
    expect(Number(idx[0].n)).toBe(1);
  });

  it("T7 a card records annex-iv-default-v1 in questionnaire_version_id; one FK to questionnaire_version, ON DELETE RESTRICT", async () => {
    const { card } = await projectWithACard();
    await app.$executeRawUnsafe(
      `UPDATE qualification.qualification SET questionnaire_version_id = 'annex-iv-default-v1' WHERE id = '${card}'`,
    );
    const fk = await admin.$queryRawUnsafe<{ conname: string; del: string }[]>(
      `SELECT conname, confdeltype::text AS del FROM pg_constraint
        WHERE conrelid = 'qualification.qualification'::regclass
          AND confrelid = 'qualification.questionnaire_version'::regclass`,
    );
    expect(fk).toEqual([{ conname: "qualification_questionnaire_version_id_fkey", del: "r" }]);
    await expect(
      app.$executeRawUnsafe(`UPDATE qualification.qualification SET questionnaire_version_id = 'no-such-version' WHERE id = '${card}'`),
    ).rejects.toThrow(/qualification_questionnaire_version_id_fkey|foreign key/i);
  });

  it("T7 the column is renamed with its index: no form_version_id, index qualification_questionnaire_version_id_idx", async () => {
    const cols = await admin.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'qualification' AND table_name = 'qualification'
          AND column_name IN ('form_version_id', 'questionnaire_version_id')`,
    );
    expect(cols).toEqual([{ column_name: "questionnaire_version_id" }]);
    const idx = await admin.$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'qualification'
         AND indexname IN ('qualification_form_version_id_idx', 'qualification_questionnaire_version_id_idx')`,
    );
    expect(idx).toEqual([{ indexname: "qualification_questionnaire_version_id_idx" }]);
  });

  it("T7 there is no FK from qualification_answer to question (01-spec A3 kept)", async () => {
    const fk = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM pg_constraint
        WHERE conrelid = 'qualification.qualification_answer'::regclass AND contype = 'f'
          AND confrelid = 'qualification.question'::regclass`,
    );
    expect(Number(fk[0].n)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T8, T9 and the live state: the migration run on a database put back to before it
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Put the schema back to the state of live: every migration up to and including 20260925120000.
 * Drops the seven new tables (their triggers go with them) and trigger functions, and the renamed
 * column; recreates the old answer index after deleting rows only the new key allows (as the old
 * R7 test did); runs the texts of 20260925090000 and 20260925120000. Only ever inside BEGIN.
 */
function revertToLive(): string {
  return `
  SET search_path TO qualification;
  LOCK TABLE qualification.qualification, qualification.qualification_answer, qualification.qualification_risk,
             qualification.knowledge_graph, qualification.card_component IN ACCESS EXCLUSIVE MODE;
  DROP TABLE qualification.questionnaire_version_item, qualification.questionnaire_version, qualification.questionnaire,
             qualification.question_set_version_item, qualification.question, qualification.question_set_version,
             qualification.question_set CASCADE;
  DO $$ DECLARE f text; BEGIN
    FOREACH f IN ARRAY ARRAY[${NEW_TRIGGERS.map(lit).join(",")}] LOOP
      EXECUTE 'DROP FUNCTION IF EXISTS qualification.' || f || '() CASCADE';
    END LOOP; END $$;
  ALTER TABLE qualification.qualification DROP COLUMN questionnaire_version_id;
  DROP INDEX qualification.qualification_answer_qualification_id_tool_id_question_id_key;
  -- Rows only the new key allows (the same questionId under two scopes, as T7 commits) could not
  -- exist before it: drop them, so the test does not depend on which tests ran first.
  DELETE FROM qualification.qualification_answer a USING qualification.qualification_answer b
   WHERE a."qualificationId" = b."qualificationId" AND a."questionId" = b."questionId" AND a.id > b.id;
  CREATE UNIQUE INDEX "QualificationAnswer_qualificationId_questionId_key"
    ON qualification.qualification_answer ("qualificationId", "questionId");
  ${readFileSync(FORMS_ARE_DATA, "utf8")}
  ${readFileSync(DEFAULT_IS_FIXED, "utf8")}
  SET search_path TO qualification;
  `;
}

/** The migration under test, followed by resetting the search path it may have changed. */
function theMigration(): string {
  return `${readFileSync(MIGRATION, "utf8")}\n;\nSET search_path TO qualification;\n`;
}

/** One md5 per history table over every row as JSON, minus the card column (either name), ordered by id. */
const digestInto = (into: string) =>
  `CREATE TEMP TABLE ${into} AS ` +
  HISTORY.map(
    (t) =>
      `SELECT '${t}'::text AS tbl, count(*)::int AS n, md5(coalesce(string_agg((to_jsonb(r) - 'form_version_id' - 'questionnaire_version_id')::text, ',' ORDER BY (to_jsonb(r))->>'id'), '')) AS h FROM qualification.${t} r`,
  ).join(" UNION ALL ") +
  ";";

/** Every history row's physical address: an UPDATE of a row moves it, a DDL rename does not. */
const ctidsInto = (into: string) =>
  `CREATE TEMP TABLE ${into} AS ` +
  HISTORY.map((t) => `SELECT '${t}'::text AS tbl, r.id::text AS id, r.ctid::text AS row_ctid FROM qualification.${t} r`).join(" UNION ALL ") +
  ";";

/** A log of every row write to the five history tables while the migration runs. */
const armWriteLog = () => `
  CREATE TEMP TABLE t_write_log (tbl text, op text, id text);
  CREATE FUNCTION qualification.t_log_write() RETURNS trigger LANGUAGE plpgsql AS $t$
  BEGIN
    INSERT INTO t_write_log VALUES (TG_TABLE_NAME, TG_OP, CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END);
    RETURN NULL;
  END $t$;
  CREATE FUNCTION qualification.t_log_truncate() RETURNS trigger LANGUAGE plpgsql AS $t$
  BEGIN INSERT INTO t_write_log VALUES (TG_TABLE_NAME, TG_OP, NULL); RETURN NULL; END $t$;
  ${HISTORY.map(
    (t) => `CREATE TRIGGER t_log_write AFTER INSERT OR UPDATE OR DELETE ON qualification.${t}
      FOR EACH ROW EXECUTE FUNCTION qualification.t_log_write();
    CREATE TRIGGER t_log_truncate AFTER TRUNCATE ON qualification.${t}
      FOR EACH STATEMENT EXECUTE FUNCTION qualification.t_log_truncate();`,
  ).join("\n")}`;

/** Per old form version: its question list (key, position and the five wording fields) in position order. */
const OLD_LISTS = `
  SELECT v.form_version_id AS version_id,
         json_agg(json_build_array(q.scope || ':' || q.local_id, v.position, v.text, v.citation, v.required,
                                   v.annex_point, v.group_label) ORDER BY v.position)::text AS list
    FROM qualification.form_version_question v JOIN qualification.form_question q ON q.id = v.question_id
   GROUP BY v.form_version_id`;
/** The same list, per questionnaire version, from the new tables. */
const NEW_LISTS = `
  SELECT i.questionnaire_version_id AS version_id,
         json_agg(json_build_array(q.scope || ':' || q.local_id, i.position, s.text, s.citation, s.required,
                                   s.annex_point, s.group_label) ORDER BY i.position)::text AS list
    FROM qualification.questionnaire_version_item i
    JOIN qualification.question_set_version_item s
      ON s.set_version_id = i.set_version_id AND s.question_id = i.question_id
    JOIN qualification.question q ON q.id = i.question_id
   GROUP BY i.questionnaire_version_id`;

/** Every row of the seven new tables, as JSON arrays ordered by key. */
const NEW_ROWS = `
  'sets', (SELECT coalesce(json_agg(json_build_object('id', id, 'name', name, 'description', description,
             'origin', origin, 'retired', retired_at IS NOT NULL, 'created_at', created_at, 'created_by', created_by)
             ORDER BY id), '[]') FROM qualification.question_set),
  'set_versions', (SELECT coalesce(json_agg(json_build_object('id', id, 'set_id', set_id, 'number', number,
             'created_at', created_at, 'created_by', created_by) ORDER BY id), '[]') FROM qualification.question_set_version),
  'questions', (SELECT coalesce(json_agg(json_build_object('id', id, 'set_id', set_id, 'scope', scope,
             'local_id', local_id, 'created_at', created_at) ORDER BY id), '[]') FROM qualification.question),
  'set_items', (SELECT coalesce(json_agg(json_build_object('set_version_id', set_version_id, 'question_id', question_id,
             'position', position, 'text', text, 'citation', citation, 'required', required,
             'annex_point', annex_point, 'group_label', group_label) ORDER BY set_version_id, position), '[]')
             FROM qualification.question_set_version_item),
  'questionnaires', (SELECT coalesce(json_agg(json_build_object('id', id, 'name', name, 'description', description,
             'origin', origin, 'listed', listed, 'retired', retired_at IS NOT NULL, 'created_at', created_at,
             'created_by', created_by) ORDER BY id), '[]') FROM qualification.questionnaire),
  'questionnaire_versions', (SELECT coalesce(json_agg(json_build_object('id', id, 'questionnaire_id', questionnaire_id,
             'number', number, 'blocks', blocks, 'created_at', created_at, 'created_by', created_by) ORDER BY id), '[]')
             FROM qualification.questionnaire_version),
  'questionnaire_items', (SELECT coalesce(json_agg(json_build_object('version_id', questionnaire_version_id,
             'position', position, 'set_version_id', set_version_id, 'question_id', question_id)
             ORDER BY questionnaire_version_id, position), '[]') FROM qualification.questionnaire_version_item),
  'triggers', (SELECT coalesce(json_agg(DISTINCT tgname), '[]') FROM pg_trigger
             WHERE NOT tgisinternal AND tgrelid IN (SELECT c.oid FROM pg_class c
               WHERE c.relnamespace = 'qualification'::regnamespace AND c.relname IN (${NEW_TABLES.map(lit).join(",")}))),
  'old_tables', (SELECT json_agg(to_regclass(x) IS NOT NULL ORDER BY x) FROM unnest(ARRAY['qualification.form','qualification.form_version',
             'qualification.form_question','qualification.form_version_question']) AS x)`;

/** The history snapshot and the write log, before and after. */
const HISTORY_RESULT = `
  'hist_before', (SELECT json_object_agg(tbl, json_build_array(n, h)) FROM t_hist_before),
  'hist_after', (SELECT json_object_agg(tbl, json_build_array(n, h)) FROM t_hist_after),
  'moved', (SELECT coalesce(json_agg(b.tbl || ' ' || b.id), '[]') FROM t_ctid_before b
             LEFT JOIN t_ctid_after a USING (tbl, id) WHERE a.row_ctid IS DISTINCT FROM b.row_ctid),
  'writes', (SELECT coalesce(json_agg(tbl || ' ' || op || ' ' || coalesce(id, '')), '[]') FROM t_write_log)`;

type Row = Record<string, unknown>;
type MigrationResult = {
  hist_before: Record<string, [number, string]>;
  hist_after: Record<string, [number, string]>;
  moved: string[];
  writes: string[];
  sets: Row[];
  set_versions: Row[];
  questions: Row[];
  set_items: Row[];
  questionnaires: Row[];
  questionnaire_versions: Row[];
  questionnaire_items: Row[];
  triggers: string[];
  old_tables: boolean[];
};

// The four fixture forms of T8, created 2026-09-01 to -04 so passes A and B visit them in this order.
const T8_FIXTURE = `
  INSERT INTO qualification.form (id, name, description, origin, listed, created_at) VALUES
    ('acme', 'Acme AI policy', 'The Acme AI policy, as questions.', 'builder', true, '2026-09-01T00:00:00Z'),
    ('mix', 'Mix', '', 'builder', true, '2026-09-02T00:00:00Z'),
    ('once', 'Custom questions: MCAS, 2026-09-25', '', 'builder', false, '2026-09-03T00:00:00Z'),
    ('odd', 'Odd', 'Imported, then edited by hand.', 'import', true, '2026-09-04T00:00:00Z');
  INSERT INTO qualification.form_version (id, form_id, number, blocks, created_at) VALUES
    ('fv-acme-1', 'acme', 1, ${blocks(ALL_BLOCKS)}, '2026-09-01T01:00:00Z'),
    ('fv-acme-2', 'acme', 2, ${blocks(ALL_BLOCKS)}, '2026-09-01T02:00:00Z'),
    ('fv-acme-3', 'acme', 3, ARRAY[]::text[], '2026-09-01T03:00:00Z'),
    ('fv-mix-1', 'mix', 1, ${blocks(["risks"])}, '2026-09-02T01:00:00Z'),
    ('fv-once-1', 'once', 1, ${blocks(ALL_BLOCKS)}, '2026-09-03T01:00:00Z'),
    ('fv-odd-1', 'odd', 1, ${blocks(["description", "risks"])}, '2026-09-04T01:00:00Z');
  INSERT INTO qualification.form_question (id, owner_form_id, scope, local_id, created_at) VALUES
    ('acme-q1', 'acme', 'f-acme', 'q1', '2026-09-01T01:00:00Z'),
    ('acme-q2', 'acme', 'f-acme', 'q2', '2026-09-01T01:00:01Z'),
    ('once-q1', 'once', 'f-once', 'q1', '2026-09-03T01:00:00Z');
  INSERT INTO qualification.form_version_question
    (form_version_id, question_id, position, text, citation, required, annex_point, group_label) VALUES
    ('fv-acme-1', 'acme-q1', 0, 'Who signs off?', '§4.2', true, NULL, NULL),
    ('fv-acme-1', 'acme-q2', 1, 'Which data?', '', false, '2d', NULL),
    ('fv-acme-2', 'acme-q1', 0, 'Who signs off a release?', '§4.2', true, NULL, NULL),
    ('fv-acme-2', 'acme-q2', 1, 'Which data?', '', false, '2d', NULL),
    ('fv-acme-3', 'acme-q1', 0, 'Who signs off a release?', '§4.2', true, NULL, NULL),
    ('fv-acme-3', 'acme-q2', 1, 'Which data?', '', false, '2d', NULL),
    ('fv-mix-1', 'acme-q1', 0, 'Who signs off?', '§4.2', true, NULL, NULL),
    ('fv-once-1', 'once-q1', 0, 'Only here?', '', true, NULL, NULL),
    ('fv-once-1', 'acme-q2', 1, 'Which data?', '', false, '2d', NULL),
    ('fv-odd-1', 'acme-q1', 0, 'Hand edited?', '§4.2', true, NULL, NULL);
  -- verbatim picks of the builtin rows: every field copied from annex-iv-default-v1
  INSERT INTO qualification.form_version_question
    (form_version_id, question_id, position, text, citation, required, annex_point, group_label)
    SELECT p.v, s.question_id, p.pos, s.text, s.citation, s.required, s.annex_point, s.group_label
      FROM (VALUES ('fv-acme-2', 'annex-iv-2a', 2), ('fv-acme-3', 'annex-iv-2a', 2), ('fv-mix-1', 'annex-iv-1a', 1))
             AS p(v, q, pos)
      JOIN qualification.form_version_question s
        ON s.form_version_id = 'annex-iv-default-v1' AND s.question_id = p.q;`;

/** Project P with card versions 1 and 2: c1 of v1 filled with mix v1, then v2 added; c2 of v2, NULL, 14 answers. */
function t8Cards(project: string, v1: string, v2: string): string {
  return `
  INSERT INTO project.system (pid, name, version, number) VALUES ('${v1}', 'MCAS', '1', (SELECT coalesce(max(number), 0) + 1 FROM project.system));
  INSERT INTO qualification.qualification (id, system_id, "systemName", "systemVersion", company, description,
      "targetUseCase", "targetUsers", updated_at, form_version_id, "systemCardJson")
    VALUES ('t8-c1', '${v1}', 'MCAS', '1', 'LIST', 'd', 'u', 't', now(), 'fv-mix-1',
            '{"card": "c1", "sections": [1, 2]}');
  INSERT INTO qualification.qualification_answer (id, "qualificationId", "toolId", "questionId", answer) VALUES
    ('t8-c1-a1', 't8-c1', 'f-acme', 'q1', 'The head of data science.'),
    ('t8-c1-a2', 't8-c1', 'annex-1', '1a', 'First release.');
  INSERT INTO qualification.qualification_risk (id, "qualificationId", position, risk, source, consequence, affected, control)
    VALUES ('t8-c1-r1', 't8-c1', 0, 'r', 's', 'c', 'user', 'k');
  INSERT INTO qualification.knowledge_graph (id, "qualificationId", digest, turtle, jsonld, nodes, triples)
    VALUES ('t8-c1-g', 't8-c1', 'digest-c1', '@prefix : <x#> .', '{"@graph": []}', 3, 7);
  INSERT INTO qualification.card_component (id, qualification_id, component_pid, airo_property, name, component_type)
    VALUES ('t8-c1-k', 't8-c1', '${randomUUID()}', 'hasModel', 'm', 'model');
  INSERT INTO project.system (pid, name, version, number) VALUES ('${v2}', 'MCAS', '2', (SELECT coalesce(max(number), 0) + 1 FROM project.system));
  INSERT INTO qualification.qualification (id, system_id, "systemName", "systemVersion", company, description,
      "targetUseCase", "targetUsers", updated_at, "systemCardJson")
    VALUES ('t8-c2', '${v2}', 'MCAS', '2', 'LIST', 'd', 'u', 't', now(), '{"card": "c2"}');
  INSERT INTO qualification.qualification_answer (id, "qualificationId", "toolId", "questionId", answer)
    SELECT 't8-c2-' || q.local_id, 't8-c2', q.scope, q.local_id, 'Answer to ' || q.local_id
      FROM qualification.form_question q WHERE q.owner_form_id = 'annex-iv-default';
  INSERT INTO qualification.knowledge_graph (id, "qualificationId", digest, turtle, jsonld, nodes, triples)
    VALUES ('t8-c2-g', 't8-c2', 'digest-c2', '@prefix : <y#> .', '{"@graph": [1]}', 5, 11);`;
}

/** Snapshot, migrate, snapshot, print. */
function migrateAndReport(tag: string, extraBefore = "", extraResult = ""): string {
  return `
  ${digestInto("t_hist_before")}
  ${ctidsInto("t_ctid_before")}
  CREATE TEMP TABLE t_lists_before AS ${OLD_LISTS};
  CREATE TEMP TABLE t_forms_before AS SELECT id, name, description, origin, listed, created_at FROM qualification.form;
  CREATE TEMP TABLE t_versions_before AS SELECT id, form_id, number, blocks, created_at FROM qualification.form_version;
  CREATE TEMP TABLE t_questions_before AS SELECT id, owner_form_id, scope, local_id, created_at FROM qualification.form_question;
  CREATE TEMP TABLE t_items_before AS SELECT * FROM qualification.form_version_question;
  ${extraBefore}
  ${armWriteLog()}
  ${theMigration()}
  ${digestInto("t_hist_after")}
  ${ctidsInto("t_ctid_after")}
  CREATE TEMP TABLE t_lists_after AS ${NEW_LISTS};
  \\pset tuples_only on
  \\pset format unaligned
  SELECT '${tag} ' || json_build_object(
    ${HISTORY_RESULT},
    ${NEW_ROWS},
    'lists_before', (SELECT json_object_agg(version_id, list::json) FROM t_lists_before),
    'lists_after', (SELECT json_object_agg(version_id, list::json) FROM t_lists_after),
    'forms_before', (SELECT json_agg(to_jsonb(f) ORDER BY id) FROM t_forms_before f),
    'versions_before', (SELECT json_agg(to_jsonb(v) ORDER BY id) FROM t_versions_before v),
    'questions_before', (SELECT json_agg(to_jsonb(q) ORDER BY id) FROM t_questions_before q),
    'items_before', (SELECT json_agg(to_jsonb(i) ORDER BY form_version_id, position) FROM t_items_before i)
    ${extraResult}
  )::text;`;
}

type Split = MigrationResult & {
  lists_before: Record<string, unknown[]>;
  lists_after: Record<string, unknown[]>;
  forms_before: Row[];
  versions_before: Row[];
  questions_before: Row[];
  items_before: Row[];
  cards_before: Row[];
  cards_after: Row[];
};

const CARDS = (into: string, ids: string[], column: string) =>
  `CREATE TEMP TABLE ${into} AS SELECT id, ${column} AS version_id, "systemCardJson"::text AS card_json,
     md5(to_jsonb(q)::text) AS row_md5_ignored FROM qualification.qualification q WHERE id IN (${ids.map(lit).join(",")});`;
const CARDS_RESULT = (before: string, after: string) => `,
  'cards_before', (SELECT json_agg(json_build_object('id', id, 'version_id', version_id, 'card_json', card_json) ORDER BY id) FROM ${before}),
  'cards_after', (SELECT json_agg(json_build_object('id', id, 'version_id', version_id, 'card_json', card_json) ORDER BY id) FROM ${after})`;

let t8: { ok: boolean; out: string; err: string; result?: Split } | null = null;

/** The T8 script, run once and shared by the T8 and T9 tests. */
function runT8() {
  if (t8) return t8;
  expect(existsSync(MIGRATION), `${MIGRATION} exists`).toBe(true);
  const project = randomUUID();
  const script = `
  BEGIN;
  ${revertToLive()}
  ${T8_FIXTURE}
  ${t8Cards(project, randomUUID(), randomUUID())}
  ${CARDS("t_cards_before", ["t8-c1", "t8-c2"], "form_version_id")}
  ${migrateAndReport(
    "T8RESULT",
    "",
    CARDS_RESULT("t_cards_before", "t_cards_after_view"),
  ).replace(
    "\\pset tuples_only on",
    `${CARDS("t_cards_after_view", ["t8-c1", "t8-c2"], "questionnaire_version_id")}\n\\pset tuples_only on`,
  )}
  ROLLBACK;`;
  const r = psql(script);
  t8 = { ...r, result: r.ok ? result<Split>(r.out, "T8RESULT") : undefined };
  return t8;
}

const t8Result = (): Split => {
  const r = runT8();
  expect(r.ok, `the T8 script failed:\n${r.err.slice(-3000)}`).toBe(true);
  return r.result!;
};

const U = "unknown";
const ts = (s: string) => new Date(s).toISOString();
/** A JSON timestamp from Postgres, as an ISO string, so the fixtures' literals compare. */
const iso = (v: unknown) => new Date(String(v)).toISOString();

describe.skipIf(!enabled)("the split, on a fixture library (T8)", () => {
  it("T8 the migration runs on the fixture without an error", () => {
    const r = runT8();
    expect(r.err, "stderr").not.toMatch(/ERROR/);
    expect(r.ok, r.err.slice(-3000)).toBe(true);
  });

  it("T8 question_set rows: annex-iv, acme (active), once (retired); none for mix or odd", () => {
    const { sets } = t8Result();
    expect(sets.map((s) => ({ ...s, created_at: iso(s.created_at) }))).toEqual([
      {
        id: "acme", name: "Acme AI policy", description: "The Acme AI policy, as questions.", origin: "builder",
        retired: false, created_at: ts("2026-09-01T00:00:00Z"), created_by: U,
      },
      {
        id: "annex-iv", name: "Annex IV", description: "EU AI Act Annex IV points 1 and 2, as 14 questions.",
        origin: "builtin", retired: false, created_at: expect.any(String), created_by: "system",
      },
      {
        id: "once", name: "Custom questions: MCAS, 2026-09-25", description: "", origin: "builder",
        retired: true, created_at: ts("2026-09-03T00:00:00Z"), created_by: U,
      },
    ]);
  });

  it("T8 the builtin set keeps the builtin form's created_at", () => {
    const { sets, forms_before } = t8Result();
    const annexForm = forms_before.find((f) => f.id === "annex-iv-default")!;
    expect(iso(sets.find((s) => s.id === "annex-iv")!.created_at)).toBe(iso(annexForm.created_at));
  });

  it("T8 question rows keep id, scope, local_id and created_at; set_id is annex-iv for the builtin ones, else the owner form", () => {
    const { questions, questions_before } = t8Result();
    expect(questions.map((q) => ({ ...q, created_at: iso(q.created_at) }))).toEqual(
      [...questions_before]
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        .map((q) => ({
          id: q.id,
          set_id: q.owner_form_id === "annex-iv-default" ? "annex-iv" : q.owner_form_id,
          scope: q.scope,
          local_id: q.local_id,
          created_at: iso(q.created_at),
        })),
    );
    expect(questions).toHaveLength(17);
  });

  it("T8 acme's set versions: v1 and v2 from its own questions, v3 the fallback for odd's hand-edited wording", () => {
    const { set_versions, set_items, versions_before } = t8Result();
    const acme = set_versions.filter((v) => v.set_id === "acme").map((v) => ({ ...v, created_at: iso(v.created_at) }));
    const odd = versions_before.find((v) => v.id === "fv-odd-1")!;
    expect(acme).toEqual([
      { id: "acme-v1", set_id: "acme", number: 1, created_at: ts("2026-09-01T01:00:00Z"), created_by: U },
      { id: "acme-v2", set_id: "acme", number: 2, created_at: ts("2026-09-01T02:00:00Z"), created_by: U },
      { id: "acme-v3", set_id: "acme", number: 3, created_at: iso(odd.created_at), created_by: U },
    ]);
    const items = (v: string) => set_items.filter((i) => i.set_version_id === v).map(({ set_version_id: _, ...i }) => i);
    const q2 = { question_id: "acme-q2", position: 1, text: "Which data?", citation: "", required: false, annex_point: "2d", group_label: null };
    expect(items("acme-v1")).toEqual([
      { question_id: "acme-q1", position: 0, text: "Who signs off?", citation: "§4.2", required: true, annex_point: null, group_label: null },
      q2,
    ]);
    expect(items("acme-v2")).toEqual([
      { question_id: "acme-q1", position: 0, text: "Who signs off a release?", citation: "§4.2", required: true, annex_point: null, group_label: null },
      q2,
    ]);
    // acme-v2's items with acme-q1 worded as odd pinned it, at the same position
    expect(items("acme-v3")).toEqual([
      { question_id: "acme-q1", position: 0, text: "Hand edited?", citation: "§4.2", required: true, annex_point: null, group_label: null },
      q2,
    ]);
  });

  it("T8 acme form v3 (same own list as v2, other blocks) was assigned acme-v2, not a new set version", () => {
    const { questionnaire_items, set_versions } = t8Result();
    expect(questionnaire_items.filter((i) => i.version_id === "fv-acme-3").map((i) => i.set_version_id)).toEqual([
      "acme-v2", "acme-v2", "annex-iv-v1",
    ]);
    expect(set_versions.filter((v) => v.set_id === "acme")).toHaveLength(3);
  });

  it("T8 once's own question makes set version once-v1 (positions from 0, own questions only)", () => {
    const { set_versions, set_items } = t8Result();
    expect(set_versions.filter((v) => v.set_id === "once").map((v) => ({ ...v, created_at: iso(v.created_at) }))).toEqual([
      { id: "once-v1", set_id: "once", number: 1, created_at: ts("2026-09-03T01:00:00Z"), created_by: U },
    ]);
    expect(set_items.filter((i) => i.set_version_id === "once-v1")).toEqual([
      {
        set_version_id: "once-v1", question_id: "once-q1", position: 0, text: "Only here?", citation: "",
        required: true, annex_point: null, group_label: null,
      },
    ]);
  });

  it("T8 annex-iv-v1 is the builtin form's 14 rows, column for column", () => {
    const { set_items, items_before, set_versions } = t8Result();
    const old = items_before
      .filter((i) => i.form_version_id === "annex-iv-default-v1")
      .map(({ form_version_id: _, ...rest }) => ({ set_version_id: "annex-iv-v1", ...rest }));
    expect(set_items.filter((i) => i.set_version_id === "annex-iv-v1")).toEqual(old);
    expect(set_versions.filter((v) => v.set_id === "annex-iv").map((v) => [v.id, v.number, v.created_by])).toEqual([
      ["annex-iv-v1", 1, "system"],
    ]);
  });

  it("T8 every questionnaire item is pinned as spec 4.2 step 6 says", () => {
    const { questionnaire_items } = t8Result();
    const pins = (v: string) =>
      questionnaire_items.filter((i) => i.version_id === v).map((i) => [i.position, i.set_version_id, i.question_id]);
    expect(pins("fv-acme-1")).toEqual([[0, "acme-v1", "acme-q1"], [1, "acme-v1", "acme-q2"]]);
    expect(pins("fv-acme-2")).toEqual([[0, "acme-v2", "acme-q1"], [1, "acme-v2", "acme-q2"], [2, "annex-iv-v1", "annex-iv-2a"]]);
    expect(pins("fv-acme-3")).toEqual([[0, "acme-v2", "acme-q1"], [1, "acme-v2", "acme-q2"], [2, "annex-iv-v1", "annex-iv-2a"]]);
    // the highest version with the wording "Who signs off?" is acme-v1
    expect(pins("fv-mix-1")).toEqual([[0, "acme-v1", "acme-q1"], [1, "annex-iv-v1", "annex-iv-1a"]]);
    // "Which data?" is worded alike in acme-v1 and -v2 (and -v3, made later): the highest then is acme-v2
    expect(pins("fv-once-1")).toEqual([[0, "once-v1", "once-q1"], [1, "acme-v2", "acme-q2"]]);
    expect(pins("fv-odd-1")).toEqual([[0, "acme-v3", "acme-q1"]]);
    expect(pins("annex-iv-default-v1")).toEqual(
      ANNEX_IDS.map((id, i) => [i, "annex-iv-v1", `annex-iv-${id}`]),
    );
  });

  it("T8 the fallback is announced: NOTICE 'made question set version acme-v3 for the wording pinned in form version fv-odd-1'", () => {
    const r = runT8();
    expect(r.err).toContain(
      "two-level forms migration: made question set version acme-v3 for the wording pinned in form version fv-odd-1",
    );
    // exactly one fallback
    expect(r.err.match(/made question set version/g)).toHaveLength(1);
  });

  it("T8 questionnaire rows: one per form, same id, name, description, origin, listing, created_at; made by unknown", () => {
    const { questionnaires, forms_before } = t8Result();
    expect(questionnaires.map((q) => ({ ...q, created_at: iso(q.created_at) }))).toEqual(
      [...forms_before]
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        .map((f) => ({
          id: f.id, name: f.name, description: f.description, origin: f.origin, listed: f.listed,
          retired: false, created_at: iso(f.created_at), created_by: f.origin === "builtin" ? "system" : U,
        })),
    );
    expect(questionnaires.map((q) => q.id)).toEqual(["acme", "annex-iv-default", "mix", "odd", "once"]);
    expect(questionnaires.find((q) => q.id === "once")!.listed).toBe(false);
  });

  it("T8 questionnaire versions keep the form versions' ids, numbers, blocks and created_at", () => {
    const { questionnaire_versions, versions_before } = t8Result();
    expect(questionnaire_versions.map((v) => ({ ...v, created_at: iso(v.created_at) }))).toEqual(
      [...versions_before]
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        .map((v) => ({
          id: v.id, questionnaire_id: v.form_id, number: v.number, blocks: v.blocks, created_at: iso(v.created_at),
          created_by: v.form_id === "annex-iv-default" ? "system" : U,
        })),
    );
  });

  it("T8 every old form version's question list (key, position, wording) is the same after, from the new tables", () => {
    const { lists_before, lists_after } = t8Result();
    expect(Object.keys(lists_before).sort()).toEqual([
      "annex-iv-default-v1", "fv-acme-1", "fv-acme-2", "fv-acme-3", "fv-mix-1", "fv-odd-1", "fv-once-1",
    ]);
    expect(lists_after).toEqual(lists_before);
  });

  it("T8 c1 keeps fv-mix-1 (the renamed column, same value); c2 keeps NULL; both keep their card JSON", () => {
    const { cards_before, cards_after } = t8Result();
    expect(cards_before).toEqual([
      { id: "t8-c1", version_id: "fv-mix-1", card_json: expect.stringContaining('"c1"') },
      { id: "t8-c2", version_id: null, card_json: expect.stringContaining('"c2"') },
    ]);
    expect(cards_after).toEqual(cards_before);
  });

  it("T8 the old tables are gone and the ten triggers exist on the new ones", () => {
    const { old_tables, triggers } = t8Result();
    expect(old_tables).toEqual([false, false, false, false]);
    expect([...triggers].sort()).toEqual(NEW_TRIGGERS);
  });

  it("T8 the builtin rules hold after the split: the builtin set and questionnaire are the only builtin rows", () => {
    const { sets, questionnaires } = t8Result();
    expect(sets.filter((s) => s.origin === "builtin").map((s) => s.id)).toEqual(["annex-iv"]);
    expect(questionnaires.filter((q) => q.origin === "builtin").map((q) => q.id)).toEqual(["annex-iv-default"]);
  });
});

describe.skipIf(!enabled)("the migration changes no history and trips no card trigger (T9)", () => {
  it("T9 the md5 of every row of the five history tables (minus the renamed column) is equal before and after", () => {
    const { hist_before, hist_after } = t8Result();
    expect(Object.keys(hist_before).sort()).toEqual([...HISTORY].sort());
    expect(hist_after).toEqual(hist_before);
    expect(hist_before.qualification_answer[0]).toBeGreaterThanOrEqual(16);
  });

  it("T9 no row of a history table was written: the write log is empty and no row moved (no UPDATE, not even a no-op one)", () => {
    const { writes, moved } = t8Result();
    expect(writes).toEqual([]);
    expect(moved).toEqual([]);
  });

  it("T9 c1, not the latest card, is untouched and nothing raised 'is of a version that is not the latest'", () => {
    const r = runT8();
    expect(r.err).not.toMatch(/is of a version that is not the latest/);
    expect(r.ok).toBe(true);
  });

  it("T9 a builtin form version missing one of its 14 rows aborts: 'the builtin form annex-iv-default v1 is not as seeded'", () => {
    expect(existsSync(MIGRATION)).toBe(true);
    const r = psql(`
      BEGIN;
      ${revertToLive()}
      DROP TRIGGER form_version_question_is_append_only ON qualification.form_version_question;
      DELETE FROM qualification.form_version_question
       WHERE form_version_id = 'annex-iv-default-v1' AND question_id = 'annex-iv-2h';
      ${theMigration()}
      ROLLBACK;`);
    expect(r.ok).toBe(false);
    expect(r.err).toContain("two-level forms migration: the builtin form annex-iv-default v1 is not as seeded");
  });

  it("T9 a tampered builtin wording row is not a precondition failure but keeps its bytes (the split copies, never rewords)", () => {
    // 4.2 step 2 checks the 14 rows and their ids; step 4 copies whatever wording they hold.
    expect(existsSync(MIGRATION)).toBe(true);
    const r = psql(`
      BEGIN;
      ${revertToLive()}
      DROP TRIGGER form_version_question_is_append_only ON qualification.form_version_question;
      UPDATE qualification.form_version_question SET text = 'Tampered wording?'
       WHERE form_version_id = 'annex-iv-default-v1' AND question_id = 'annex-iv-2h';
      ${theMigration()}
      \\pset tuples_only on
      \\pset format unaligned
      SELECT 'TAMPER ' || json_build_object('text', (SELECT text FROM qualification.question_set_version_item
        WHERE set_version_id = 'annex-iv-v1' AND question_id = 'annex-iv-2h'))::text;
      ROLLBACK;`);
    expect(r.ok, r.err.slice(-2000)).toBe(true);
    expect(result<{ text: string }>(r.out, "TAMPER")).toEqual({ text: "Tampered wording?" });
  });

  it("T9 a second builtin form aborts the migration (the precondition wants exactly one)", () => {
    expect(existsSync(MIGRATION)).toBe(true);
    const r = psql(`
      BEGIN;
      ${revertToLive()}
      ALTER TABLE qualification.form DROP CONSTRAINT form_builtin_is_the_default;
      INSERT INTO qualification.form (id, name, origin) VALUES ('second-builtin', 'Second builtin', 'builtin');
      ${theMigration()}
      ROLLBACK;`);
    expect(r.ok).toBe(false);
    expect(r.err).toContain("two-level forms migration: the builtin form annex-iv-default v1 is not as seeded");
  });

  it("T9 D29 a form whose description is 600 characters aborts the migration and changes nothing", () => {
    expect(existsSync(MIGRATION)).toBe(true);
    const r = psql(`
      \\set ON_ERROR_STOP off
      BEGIN;
      ${revertToLive()}
      INSERT INTO qualification.form (id, name, description, origin, created_at)
        VALUES ('long', 'Long', repeat('x', 600), 'builder', '2026-09-05T00:00:00Z');
      INSERT INTO qualification.form_version (id, form_id, number, blocks) VALUES ('fv-long-1', 'long', 1, ARRAY[]::text[]);
      INSERT INTO qualification.form_question (id, owner_form_id, scope, local_id) VALUES ('long-q1', 'long', 'f-long', 'q1');
      INSERT INTO qualification.form_version_question (form_version_id, question_id, position, text, required)
        VALUES ('fv-long-1', 'long-q1', 0, 'Long?', true);
      SAVEPOINT before_migration;
      ${theMigration()}
      ROLLBACK TO SAVEPOINT before_migration;
      \\pset tuples_only on
      \\pset format unaligned
      SELECT 'AFTER ' || json_build_object(
        'form', to_regclass('qualification.form') IS NOT NULL,
        'question_set', to_regclass('qualification.question_set') IS NOT NULL,
        'long', (SELECT length(description) FROM qualification.form WHERE id = 'long'),
        'column', (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'qualification'
                     AND table_name = 'qualification' AND column_name = 'form_version_id'))::text;
      ROLLBACK;`);
    expect(r.err).toMatch(/violates check constraint "(question_set|questionnaire)_description_length"/);
    expect(result(r.out, "AFTER")).toEqual({ form: true, question_set: false, long: 600, column: 1 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The state of live (read-only check 2026-09-25): 1 builtin form, 1 version, 14 questions, 14
// version rows, 1 card with form_version_id NULL and 14 answers, no custom forms.
// ─────────────────────────────────────────────────────────────────────────────

/** The live card: NULL form version, 14 Annex answers, its graph, a risk and its card JSON. */
function liveCard(project: string, v1: string): string {
  return `
  INSERT INTO project.system (pid, name, version, number) VALUES ('${v1}', 'MCAS', 'v1.2.0', (SELECT coalesce(max(number), 0) + 1 FROM project.system));
  INSERT INTO qualification.qualification (id, system_id, "systemName", "systemVersion", company, description,
      "targetUseCase", "targetUsers", updated_at, "systemCardJson", "ontologyExtracted")
    VALUES ('live-card', '${v1}', 'MicroCredit Assist Score (MCAS)', 'v1.2.0', 'Creditum AI SARL',
            'Credit scoring', 'Retail banking', 'Applicants', '2026-09-24T10:00:00Z',
            '{"form": {"name": "Annex IV default", "version": 1}, "coverage": {"summary": "Annex IV coverage: 14 of 14 points."}, "additionalDocumentation": []}',
            '{"model": "gbdt"}');
  INSERT INTO qualification.qualification_answer (id, "qualificationId", "toolId", "questionId", answer)
    SELECT 'live-' || q.local_id, 'live-card', q.scope, q.local_id, 'Live answer to ' || q.local_id || ', é ✓'
      FROM qualification.form_question q WHERE q.owner_form_id = 'annex-iv-default';
  INSERT INTO qualification.qualification_risk (id, "qualificationId", position, risk, source, consequence, affected, control)
    VALUES ('live-r1', 'live-card', 0, 'Wrong reject', 'Thin data', 'Refused loan', 'user', 'Human review');
  INSERT INTO qualification.knowledge_graph (id, "qualificationId", digest, turtle, jsonld, nodes, triples)
    VALUES ('live-g', 'live-card', 'sha256:5f1c', '@prefix airo: <https://w3id.org/airo#> .', '{"@context": {}, "@graph": []}', 40, 120);`;
}

const LIVE_EXTRA = `
  CREATE TEMP TABLE t_live_before AS SELECT
    (SELECT json_agg(json_build_array(id, "toolId", "questionId", answer, ctid::text) ORDER BY id)
       FROM qualification.qualification_answer WHERE "qualificationId" = 'live-card') AS answers,
    (SELECT json_build_array(digest, md5(turtle), md5(jsonld), nodes, triples, built_at)
       FROM qualification.knowledge_graph WHERE "qualificationId" = 'live-card') AS graph,
    (SELECT "systemCardJson"::text FROM qualification.qualification WHERE id = 'live-card') AS card_json,
    (SELECT md5((to_jsonb(q) - 'form_version_id')::text) FROM qualification.qualification q WHERE id = 'live-card') AS card_row,
    (SELECT form_version_id FROM qualification.qualification WHERE id = 'live-card') AS version_id;`;
const LIVE_AFTER = `
  CREATE TEMP TABLE t_live_after AS SELECT
    (SELECT json_agg(json_build_array(id, "toolId", "questionId", answer, ctid::text) ORDER BY id)
       FROM qualification.qualification_answer WHERE "qualificationId" = 'live-card') AS answers,
    (SELECT json_build_array(digest, md5(turtle), md5(jsonld), nodes, triples, built_at)
       FROM qualification.knowledge_graph WHERE "qualificationId" = 'live-card') AS graph,
    (SELECT "systemCardJson"::text FROM qualification.qualification WHERE id = 'live-card') AS card_json,
    (SELECT md5((to_jsonb(q) - 'questionnaire_version_id')::text) FROM qualification.qualification q WHERE id = 'live-card') AS card_row,
    (SELECT questionnaire_version_id FROM qualification.qualification WHERE id = 'live-card') AS version_id;`;

type Live = Split & { live_before: Row; live_after: Row };
let live: { ok: boolean; out: string; err: string; result?: Live } | null = null;

function runLive() {
  if (live) return live;
  expect(existsSync(MIGRATION), `${MIGRATION} exists`).toBe(true);
  const script = `
  BEGIN;
  ${revertToLive()}
  ${liveCard(randomUUID(), randomUUID())}
  ${migrateAndReport(
    "LIVERESULT",
    LIVE_EXTRA,
    `, 'live_before', (SELECT to_json(b) FROM t_live_before b), 'live_after', (SELECT to_json(a) FROM t_live_after a)`,
  ).replace("\\pset tuples_only on", `${LIVE_AFTER}\n\\pset tuples_only on`)}
  ROLLBACK;`;
  const r = psql(script);
  live = { ...r, result: r.ok ? result<Live>(r.out, "LIVERESULT") : undefined };
  return live;
}

const liveResult = (): Live => {
  const r = runLive();
  expect(r.ok, `the live-state script failed:\n${r.err.slice(-3000)}`).toBe(true);
  return r.result!;
};

describe.skipIf(!enabled)("on a database in the state of live, the card is byte-identical after (T9, 4.3)", () => {
  it("T9 live the database before is live's: one form (builtin), one version, 14 questions, 14 version rows", () => {
    const r = liveResult();
    expect(r.forms_before.map((f) => [f.id, f.origin, f.listed])).toEqual([["annex-iv-default", "builtin", true]]);
    expect(r.versions_before.map((v) => v.id)).toEqual(["annex-iv-default-v1"]);
    expect(r.questions_before).toHaveLength(14);
    expect(r.items_before).toHaveLength(14);
    expect(r.live_before.version_id).toBeNull();
    expect(r.live_before.answers as unknown[]).toHaveLength(14);
  });

  it("T9 live the card's 14 answers are byte-identical and did not move (id, toolId, questionId, answer, ctid)", () => {
    const { live_before, live_after } = liveResult();
    expect(live_after.answers).toEqual(live_before.answers);
  });

  it("T9 live the knowledge graph (digest, turtle and JSON-LD bytes, counts, built_at) is unchanged", () => {
    const { live_before, live_after } = liveResult();
    expect(live_after.graph).toEqual(live_before.graph);
    expect((live_before.graph as unknown[])[0]).toBe("sha256:5f1c");
  });

  it("T9 live the card JSON and the whole card row (minus the renamed column) are byte-identical; the version stays NULL", () => {
    const { live_before, live_after } = liveResult();
    expect(live_after.card_json).toBe(live_before.card_json);
    expect(live_after.card_row).toBe(live_before.card_row);
    expect(live_after.version_id).toBeNull();
  });

  it("T9 live every history table's digest is unchanged, nothing was written, no row moved", () => {
    const { hist_before, hist_after, writes, moved } = liveResult();
    expect(hist_after).toEqual(hist_before);
    expect(writes).toEqual([]);
    expect(moved).toEqual([]);
  });

  it("T9 live the new rows are exactly the builtin level: 1 set, 1 set version, 14 questions, 14 wording rows, 1 questionnaire, 1 version, 14 items", () => {
    const r = liveResult();
    expect(r.sets.map((s) => s.id)).toEqual(["annex-iv"]);
    expect(r.set_versions.map((v) => v.id)).toEqual(["annex-iv-v1"]);
    expect(r.questions).toHaveLength(14);
    expect(r.set_items).toHaveLength(14);
    expect(r.questionnaires.map((q) => q.id)).toEqual(["annex-iv-default"]);
    expect(r.questionnaire_versions.map((v) => v.id)).toEqual(["annex-iv-default-v1"]);
    expect(r.questionnaire_items).toHaveLength(14);
    expect(r.old_tables).toEqual([false, false, false, false]);
  });

  it("T9 live the builtin rows carry the old rows' values: names, description, created_at, blocks, wording, made by system", () => {
    const r = liveResult();
    const form = r.forms_before[0];
    const version = r.versions_before[0];
    expect({ ...r.sets[0], created_at: iso(r.sets[0].created_at) }).toEqual({
      id: "annex-iv", name: "Annex IV", description: "EU AI Act Annex IV points 1 and 2, as 14 questions.",
      origin: "builtin", retired: false, created_at: iso(form.created_at), created_by: "system",
    });
    expect({ ...r.set_versions[0], created_at: iso(r.set_versions[0].created_at) }).toEqual({
      id: "annex-iv-v1", set_id: "annex-iv", number: 1, created_at: iso(version.created_at), created_by: "system",
    });
    expect({ ...r.questionnaires[0], created_at: iso(r.questionnaires[0].created_at) }).toEqual({
      id: "annex-iv-default", name: form.name, description: form.description, origin: "builtin", listed: true,
      retired: false, created_at: iso(form.created_at), created_by: "system",
    });
    expect({ ...r.questionnaire_versions[0], created_at: iso(r.questionnaire_versions[0].created_at) }).toEqual({
      id: "annex-iv-default-v1", questionnaire_id: "annex-iv-default", number: 1, blocks: ALL_BLOCKS,
      created_at: iso(version.created_at), created_by: "system",
    });
    expect(r.questions.map((q) => ({ ...q, created_at: iso(q.created_at) }))).toEqual(
      [...r.questions_before]
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        .map((q) => ({ id: q.id, set_id: "annex-iv", scope: q.scope, local_id: q.local_id, created_at: iso(q.created_at) })),
    );
    expect(r.set_items).toEqual(
      r.items_before.map(({ form_version_id: _, ...rest }) => ({ set_version_id: "annex-iv-v1", ...rest })),
    );
    expect(r.questionnaire_items).toEqual(
      r.items_before.map((i) => ({
        version_id: "annex-iv-default-v1", position: i.position, set_version_id: "annex-iv-v1", question_id: i.question_id,
      })),
    );
    expect(r.lists_after).toEqual(r.lists_before);
  });

  it("T9 live the card's questionnaire resolves, in memory, to exactly the wording the card was rendered with", async () => {
    // NULL resolves to annexDefaultVersion() (T3 proves it equals the migrated rows); here the
    // migrated rows are compared with the old ones, so the twin, the old rows and the new rows agree.
    const { annexDefaultVersion } = await loadSrc("domain/forms/legacy.ts");
    const r = liveResult();
    expect(
      r.set_items.map((i) => [i.question_id, i.text, i.citation, i.required, i.annex_point, i.group_label]),
    ).toEqual(
      annexDefaultVersion().questions.map(
        (q: { questionId: string; text: string; citation: string; required: boolean; annexPoint: string; groupLabel: string }) =>
          [q.questionId, q.text, q.citation, q.required, q.annexPoint, q.groupLabel],
      ),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Aborts on a count check: the checks of 4.2 step 7 and 11 really stop the migration. A test-only
// event trigger arms a row trigger on a table the migration creates, so the migration's own
// INSERT ... SELECT loses (C5) or adds (C8) one row; the migration must notice and roll back.
// ─────────────────────────────────────────────────────────────────────────────

/** Arm `body` (a BEFORE/AFTER row trigger on qualification.questionnaire_version_item) as soon as the migration creates it. */
function armOnCreate(triggerSql: string): string {
  return `
  CREATE FUNCTION qualification.t_arm() RETURNS event_trigger LANGUAGE plpgsql AS $t$
  DECLARE r record;
  BEGIN
    FOR r IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
      IF r.command_tag = 'CREATE TABLE' AND r.object_identity = 'qualification.questionnaire_version_item' THEN
        EXECUTE ${lit(triggerSql)};
      END IF;
    END LOOP;
  END $t$;
  CREATE EVENT TRIGGER t_arm ON ddl_command_end WHEN TAG IN ('CREATE TABLE') EXECUTE FUNCTION qualification.t_arm();`;
}

function abortScript(setup: string): { ok: boolean; out: string; err: string; after?: Row } {
  expect(existsSync(MIGRATION)).toBe(true);
  const r = psql(`
    \\set ON_ERROR_STOP off
    BEGIN;
    ${revertToLive()}
    ${liveCard(randomUUID(), randomUUID())}
    ${setup}
    SAVEPOINT before_migration;
    ${theMigration()}
    ROLLBACK TO SAVEPOINT before_migration;
    \\pset tuples_only on
    \\pset format unaligned
    SELECT 'AFTER ' || json_build_object(
      'form', to_regclass('qualification.form') IS NOT NULL,
      'question_set', to_regclass('qualification.question_set') IS NOT NULL,
      'answers', (SELECT count(*) FROM qualification.qualification_answer WHERE "qualificationId" = 'live-card'),
      'risks', (SELECT count(*) FROM qualification.qualification_risk WHERE "qualificationId" = 'live-card'))::text;
    ROLLBACK;`);
  return { ...r, after: r.out.includes("AFTER ") ? result<Row>(r.out, "AFTER") : undefined };
}

describe.skipIf(!enabled)("a failing count check aborts the whole migration (4.2 steps 7 and 11)", () => {
  it("T9 C5: a questionnaire item lost on the way (swallowed by a test trigger) fails check C5 and leaves the old tables", () => {
    const r = abortScript(`
      CREATE FUNCTION qualification.t_swallow() RETURNS trigger LANGUAGE plpgsql AS $t$
      BEGIN IF NEW.question_id = 'annex-iv-2h' THEN RETURN NULL; END IF; RETURN NEW; END $t$;
      ${armOnCreate("CREATE TRIGGER t_swallow BEFORE INSERT ON qualification.questionnaire_version_item FOR EACH ROW EXECUTE FUNCTION qualification.t_swallow()")}`);
    expect(r.err).toMatch(/two-level forms migration: check C5 failed: expected (14, found 13|0, found 1)/);
    expect(r.after).toEqual({ form: true, question_set: false, answers: 14, risks: 1 });
  });

  it("T9 C8: a history row written during the migration (by a test trigger) fails check C8 and is rolled back with it", () => {
    const r = abortScript(`
      CREATE FUNCTION qualification.t_write_history() RETURNS trigger LANGUAGE plpgsql AS $t$
      BEGIN
        IF NEW.question_id = 'annex-iv-2h' THEN
          INSERT INTO qualification.qualification_risk (id, "qualificationId", position, risk, source, consequence, affected, control)
            VALUES ('t-stray-risk', 'live-card', 1, 'r', 's', 'c', 'user', 'k');
        END IF;
        RETURN NULL;
      END $t$;
      ${armOnCreate("CREATE TRIGGER t_write_history AFTER INSERT ON qualification.questionnaire_version_item FOR EACH ROW EXECUTE FUNCTION qualification.t_write_history()")}`);
    const m = /two-level forms migration: check C8 failed: expected (\d+), found (\d+)/.exec(r.err);
    expect(m, r.err.slice(-2000)).not.toBeNull();
    expect(Number(m![2])).toBe(Number(m![1]) + 1);
    expect(r.after).toEqual({ form: true, question_set: false, answers: 14, risks: 1 });
  });
});
