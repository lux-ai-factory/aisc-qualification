import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import { APP, FORMS_SKIP_REASON, formsMerged, read } from "../support/isolation";

// Isolation stage 2 (01-specs.md I3.5, I4.2, I4.6): the migration history a project
// database is built from, read as files. The database side (the schema it makes equals the
// live one minus project_id) is test/db/projectDatabase.db.test.ts.

const MIGRATIONS = join(APP, "prisma", "migrations");
const BASELINE = "20260926000000_project_database";
const FORMS = ["20260925090000_forms_are_data", "20260925120000_the_default_form_is_fixed"];
/** The uncommitted originals of the forms work (read only, never edited: RULES.md). */
const FORMS_ORIGINALS = join(homedir(), "aisc-install", "apps", "qualification", "prisma", "migrations");
const dirs = () => readdirSync(MIGRATIONS).filter((d) => /^\d{14}_/.test(d)).sort();

describe("I3.5 one baseline for project databases", () => {
  it("I3.5 prisma/migrations/20260926000000_project_database exists", () => {
    expect(existsSync(join(MIGRATIONS, BASELINE, "migration.sql")), `I3.5: ${BASELINE}/migration.sql`).toBe(true);
  });

  it("I3.5 the baseline names neither core nor project_id (grep -c 'core\\.\\|project_id' is 0)", () => {
    const file = join(MIGRATIONS, BASELINE, "migration.sql");
    expect(existsSync(file), `I3.5: ${BASELINE}/migration.sql`).toBe(true);
    const hits = read(file).split("\n").filter((l) => /core\.|project_id/.test(l));
    expect(hits).toEqual([]);
  });

  it("I3.5 the baseline keys the card to project.system(pid) ON DELETE CASCADE and grants the readers", () => {
    const file = join(MIGRATIONS, BASELINE, "migration.sql");
    expect(existsSync(file)).toBe(true);
    const sql = read(file);
    expect(sql).toMatch(/qualification_system_id_fkey[\s\S]*REFERENCES\s+"?project"?\."?system"?\s*\(\s*"?pid"?\s*\)[\s\S]*ON DELETE CASCADE/i);
    expect(sql).toMatch(/card_is_latest[\s\S]*project\.system/);
    for (const role of ["report_ro", "dashboard_ro"]) expect(sql, `I2.6: ${role}`).toContain(role);
  });

  it("I3.5 the old pre-isolation directories are deleted: the baseline is the first, only forms migrations (and later) follow", () => {
    const all = dirs();
    expect(all[0]).toBe(BASELINE);
    const before = all.filter((d) => d < BASELINE && !FORMS.includes(d));
    expect(before, "I3.5: pre-baseline migration directories left").toEqual([]);
  });

  it("I3.5 no migration directory on the branch names core. (they could not replay in a project database)", () => {
    const offenders = dirs().filter((d) => /\bcore\./.test(readFileSync(join(MIGRATIONS, d, "migration.sql"), "utf8")));
    expect(offenders).toEqual([]);
  });

  const originalsThere = FORMS.every((d) => existsSync(join(FORMS_ORIGINALS, d, "migration.sql")));
  it.skipIf(!formsMerged || !originalsThere)(
    `I3.5 I4.6 the two forms migrations are byte-for-byte the originals (${!formsMerged ? FORMS_SKIP_REASON : "originals not found in ~/aisc-install"})`,
    () => {
      for (const d of FORMS) {
        const here = readFileSync(join(MIGRATIONS, d, "migration.sql"));
        const there = readFileSync(join(FORMS_ORIGINALS, d, "migration.sql"));
        expect(here.equals(there), `I3.5: ${d} differs from the original`).toBe(true);
      }
    },
  );
});

describe("I4.2 the form library has its own Prisma schema and migrations (Q2)", () => {
  it.skipIf(!formsMerged)(`I4.2 prisma/library/schema.prisma with the four form models, its own client and migrations (${FORMS_SKIP_REASON})`, () => {
    const schema = join(APP, "prisma", "library", "schema.prisma");
    expect(existsSync(schema)).toBe(true);
    const text = read(schema);
    for (const m of ["Form", "FormVersion", "FormQuestion", "FormVersionQuestion"]) expect(text).toMatch(new RegExp(`model\\s+${m}\\b`));
    expect(text, "I4.2: generated to its own client, not @prisma/client").toMatch(/output\s*=/);
    expect(text, "I4.2: schema form_library").toMatch(/form_library/);
    expect(text).not.toMatch(/model\s+Qualification\b/);
    const lib = join(APP, "prisma", "library", "migrations");
    expect(existsSync(lib) && readdirSync(lib).some((d) => /^\d{14}_/.test(d))).toBe(true);
  });

  it.skipIf(!formsMerged)(`I4.2 I3.8 the library client is opened from FORM_LIBRARY_DATABASE_URL (${FORMS_SKIP_REASON})`, () => {
    const hits = readdirSync(join(APP, "src", "lib")).filter((f) => read(join(APP, "src", "lib", f)).includes("FORM_LIBRARY_DATABASE_URL"));
    expect(hits.length).toBeGreaterThan(0);
  });

  it("I4.6 gate recorded: until the forms work is merged no forms file is on this branch (so Q2 tests skip, not fail)", () => {
    // Guard of the gate itself: either all three forms files are here or none.
    const present = [
      join(APP, "src", "server", "repositories", "FormRepository.ts"),
      join(APP, "src", "server", "services", "FormService.ts"),
      join(MIGRATIONS, FORMS[0], "migration.sql"),
    ].map((f) => existsSync(f));
    expect(present.every(Boolean) || present.every((p) => !p), `partial forms merge: ${present}`).toBe(true);
  });
});
