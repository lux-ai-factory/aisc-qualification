import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { APP, read } from "../support/isolation";

// The migration history a project database is built from, read as files. There is no
// install-wide form library: the forms a person makes stay in their own project's database,
// and the builtin Annex IV forms are seeded into every project database by the forms
// migrations themselves. The database side (the schema it makes equals the live one minus
// project_id) is test/db/projectDatabase.db.test.ts.

const MIGRATIONS = join(APP, "prisma", "migrations");
const BASELINE = "20260925000000_project_database";
const FORMS = [
  "20260925090000_forms_are_data",
  "20260925120000_the_default_form_is_fixed",
  "20260925150000_two_level_forms",
];
const dirs = () =>
  readdirSync(MIGRATIONS)
    .filter((d) => /^\d{14}_/.test(d))
    .sort();

describe("one baseline for project databases", () => {
  it("the baseline names neither core nor project_id (grep -c 'core\\.\\|project_id' is 0)", () => {
    const file = join(MIGRATIONS, BASELINE, "migration.sql");
    expect(existsSync(file), `${BASELINE}/migration.sql`).toBe(true);
    const hits = read(file)
      .split("\n")
      .filter((l) => /core\.|project_id/.test(l));
    expect(hits).toEqual([]);
  });

  it("the baseline keys the card to project.system(pid) ON DELETE CASCADE and grants the readers", () => {
    const file = join(MIGRATIONS, BASELINE, "migration.sql");
    expect(existsSync(file)).toBe(true);
    const sql = read(file);
    expect(sql).toMatch(
      /qualification_system_id_fkey[\s\S]*REFERENCES\s+"?project"?\."?system"?\s*\(\s*"?pid"?\s*\)[\s\S]*ON DELETE CASCADE/i,
    );
    expect(sql).toMatch(/card_is_latest[\s\S]*project\.system/);
    for (const role of ["report_ro", "dashboard_ro"])
      expect(sql, `the grants to ${role}`).toContain(role);
  });

  it("the old pre-isolation directories are deleted: the baseline is the first, only forms migrations (and later) follow", () => {
    const all = dirs();
    expect(all[0]).toBe(BASELINE);
    const before = all.filter((d) => d < BASELINE && !FORMS.includes(d));
    expect(before, "pre-baseline migration directories left").toEqual([]);
  });

  it("no migration directory on the branch names core. (they could not replay in a project database)", () => {
    const offenders = dirs().filter((d) =>
      /\bcore\./.test(
        readFileSync(join(MIGRATIONS, d, "migration.sql"), "utf8"),
      ),
    );
    expect(offenders).toEqual([]);
  });

});

describe("forms live in each project's database", () => {
  it("the forms work is merged: its services, repositories and the three migrations are all here", () => {
    const missing = [
      join(APP, "src", "server", "repositories", "QuestionSetRepository.ts"),
      join(APP, "src", "server", "repositories", "QuestionnaireRepository.ts"),
      join(APP, "src", "server", "services", "QuestionSetService.ts"),
      join(APP, "src", "server", "services", "QuestionnaireService.ts"),
      ...FORMS.map((d) => join(MIGRATIONS, d, "migration.sql")),
    ].filter((f) => !existsSync(f));
    expect(missing).toEqual([]);
  });

  it("the forms migrations follow the baseline, so every project database gets them", () => {
    const all = dirs();
    for (const d of FORMS)
      expect(all.indexOf(d), d).toBeGreaterThan(all.indexOf(BASELINE));
  });

  it("the last forms migration seeds the builtin Annex IV set and default questionnaire", () => {
    const sql = read(join(MIGRATIONS, FORMS[2], "migration.sql"));
    expect(sql).toMatch(
      /INSERT INTO qualification\.question_set[\s\S]*'annex-iv'[\s\S]*'builtin'/,
    );
    expect(sql).toMatch(
      /INSERT INTO qualification\.questionnaire \([\s\S]*'annex-iv-default'[\s\S]*'builtin'/,
    );
  });

  it("there is no install-wide form library: no prisma/library, and nothing reads FORM_LIBRARY_DATABASE_URL", () => {
    expect(existsSync(join(APP, "prisma", "library")), "prisma/library").toBe(
      false,
    );
    const readers = [join(APP, "src"), join(APP, "scripts")]
      .flatMap((dir) =>
        readdirSync(dir, { recursive: true, withFileTypes: true })
          .filter((e) => e.isFile())
          .map((e) => join(e.parentPath, e.name)),
      )
      .filter(
        (f) =>
          /\.(ts|tsx|mjs|js)$/.test(f) &&
          read(f).includes("FORM_LIBRARY_DATABASE_URL"),
      );
    expect(readers).toEqual([]);
  });
});
