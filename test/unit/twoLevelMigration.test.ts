import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// The two-level forms migration, read as text: it changes no history row, and creates its
// triggers after the data. What it does to a real database is test/db/twoLevelForms.db.test.ts.

const MIGRATION =
  "prisma/migrations/20260925150000_two_level_forms/migration.sql";
const APPLIED = [
  "prisma/migrations/20260925090000_forms_are_data/migration.sql",
  "prisma/migrations/20260925120000_the_default_form_is_fixed/migration.sql",
];

const raw = () => readFileSync(MIGRATION, "utf8");

/** `--` comments stripped (outside quoted strings is enough for this file's shape). */
function withoutComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      let quoted = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === "'") quoted = !quoted;
        if (!quoted && line[i] === "-" && line[i + 1] === "-")
          return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}

/**
 * The text with the body of every `CREATE [OR REPLACE] FUNCTION ... AS $$ ... $$` removed (the
 * trigger functions, which only raise). `DO $$ ... $$` bodies are kept: the split lives there,
 * and it must not update, delete or truncate either.
 */
function withoutFunctionBodies(sql: string): string {
  return sql.replace(
    /(CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION[\s\S]*?)\$(\w*)\$[\s\S]*?\$\2\$/gi,
    "$1<body>",
  );
}

/** The scanned text: comments and function bodies gone. */
const scanned = () => withoutFunctionBodies(withoutComments(raw()));

/** Every statement start: each line's first word after leading whitespace, and the text after each `;`. */
function statementStarts(sql: string): string[] {
  const starts: string[] = [];
  for (const line of sql.split("\n")) {
    starts.push(line.trimStart());
    for (const part of line.split(";").slice(1)) starts.push(part.trimStart());
  }
  return starts.filter((s) => s !== "");
}

// every trigger the migration creates, after the data
const TRIGGERS = [
  "question_set_version_is_append_only",
  "question_set_version_item_is_append_only",
  "questionnaire_version_is_append_only",
  "questionnaire_version_item_is_append_only",
  "question_identity_is_fixed",
  "question_set_version_item_is_of_its_set",
  "question_set_row_is_fixed",
  "questionnaire_row_is_fixed",
  "question_set_version_is_allowed",
  "questionnaire_version_is_allowed",
];

describe("the two-level migration file obeys its rules (T2)", () => {
  it("T2 the migration file exists at prisma/migrations/20260925150000_two_level_forms/migration.sql", () => {
    expect(existsSync(MIGRATION)).toBe(true);
  });

  it("T2 it has no BEGIN, COMMIT, CONCURRENTLY, IF EXISTS or CASCADE", () => {
    // `ON COMMIT DROP` (on the migration's temp tables) is not a COMMIT
    const text = scanned().replace(
      /\bON\s+COMMIT\s+DROP\b/gi,
      "ON_COMMIT_DROP",
    );
    for (const word of [
      /\bBEGIN\s*;/i,
      /\bCOMMIT\b/i,
      /\bCONCURRENTLY\b/i,
      /\bIF\s+EXISTS\b/i,
      /\bCASCADE\b/i,
    ]) {
      expect(text, String(word)).not.toMatch(word);
    }
    // BEGIN also opens every DO block's body; a transaction BEGIN is a statement of its own
    for (const s of statementStarts(text)) {
      expect(s, "a transaction BEGIN").not.toMatch(
        /^BEGIN\s*(TRANSACTION|WORK)?\s*;/i,
      );
      expect(s).not.toMatch(/^START\s+TRANSACTION/i);
    }
  });

  it("T2 no statement starts with UPDATE, DELETE FROM or TRUNCATE (DO blocks included)", () => {
    for (const s of statementStarts(scanned())) {
      expect(s, s.slice(0, 80)).not.toMatch(
        /^(UPDATE\b|DELETE\s+FROM\b|TRUNCATE\b)/i,
      );
    }
  });

  it("T2 no DO block has an EXCEPTION clause (no subtransactions)", () => {
    const text = withoutComments(raw());
    const blocks = [...text.matchAll(/\bDO\s+\$(\w*)\$([\s\S]*?)\$\1\$/gi)].map(
      (m) => m[2],
    );
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) {
      // RAISE EXCEPTION is how the checks fail; an EXCEPTION clause starts a line of its own: `EXCEPTION WHEN`
      expect(b).not.toMatch(/(^|\n)\s*EXCEPTION\s*(\n|\s+WHEN)/i);
    }
  });

  it("T2 every table and function it names is schema-qualified", () => {
    const text = scanned();
    for (const m of text.matchAll(
      /\b(?:CREATE\s+TABLE|DROP\s+TABLE|ALTER\s+TABLE|INSERT\s+INTO|CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION|DROP\s+FUNCTION|EXECUTE\s+FUNCTION)\s+(?!TEMP)([\w".]+)/gi,
    )) {
      if (/^(tlf_\w+|pg_temp\.\w+)$/i.test(m[1])) continue; // the migration's own temp tables
      expect(m[1], m[0]).toMatch(/^qualification\./);
    }
    for (const m of text.matchAll(
      /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+\w+\s+ON\s+([\w".]+)/gi,
    )) {
      expect(m[1], m[0]).toMatch(/^qualification\./);
    }
  });

  it("T2 the capture, the tables, the column rename, the drops and the triggers come in the order of spec 4.2", () => {
    const text = scanned();
    const at = (needle: string | RegExp) => {
      const i =
        typeof needle === "string" ? text.indexOf(needle) : text.search(needle);
      expect(i, String(needle)).toBeGreaterThanOrEqual(0);
      return i;
    };
    const capture = at(
      /CREATE\s+TEMP\s+TABLE\s+tlf_counts\s+ON\s+COMMIT\s+DROP/i,
    );
    const create = at("CREATE TABLE qualification.question_set");
    const rename = at(
      /RENAME\s+COLUMN\s+form_version_id\s+TO\s+questionnaire_version_id/i,
    );
    const dropFvq = at("DROP TABLE qualification.form_version_question");
    const dropForm = at("DROP TABLE qualification.form;");
    expect(capture).toBeLessThan(create);
    expect(create).toBeLessThan(rename);
    expect(rename).toBeLessThan(dropFvq);
    expect(dropFvq).toBeLessThan(dropForm);
    const lastDrop = Math.max(
      ...[...text.matchAll(/DROP TABLE qualification\.\w+/g)].map(
        (m) => m.index!,
      ),
    );
    for (const t of TRIGGERS) {
      const created = [
        ...text.matchAll(new RegExp(`CREATE\\s+TRIGGER\\s+${t}\\b`, "g")),
      ];
      expect(created, `CREATE TRIGGER ${t}`).toHaveLength(1);
      expect(
        created[0].index!,
        `${t} after the last DROP TABLE`,
      ).toBeGreaterThan(lastDrop);
    }
  });

  it("T2 it drops the four form tables in order and the five old trigger functions", () => {
    const text = scanned();
    const drops = [...text.matchAll(/DROP TABLE (qualification\.\w+)/g)].map(
      (m) => m[1],
    );
    expect(drops).toEqual([
      "qualification.form_version_question",
      "qualification.form_question",
      "qualification.form_version",
      "qualification.form",
    ]);
    for (const f of [
      "form_version_is_append_only",
      "form_version_question_is_append_only",
      "form_question_identity_is_fixed",
      "form_name_is_fixed",
      "form_builtin_is_fixed",
    ]) {
      expect(text, f).toMatch(
        new RegExp(`DROP FUNCTION qualification\\.${f}\\(\\)`),
      );
    }
  });

  it("T2 it raises the precondition message of spec 4.2 step 2 and the check messages of step 7", () => {
    const text = raw();
    expect(text).toContain(
      "two-level forms migration: the builtin form annex-iv-default v1 is not as seeded",
    );
    expect(text).toMatch(
      /two-level forms migration: check .* failed: expected .*, found /,
    );
    for (const c of ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"])
      expect(text, c).toContain(c);
  });

  it("T2 it creates every trigger function with CREATE OR REPLACE FUNCTION qualification.<name>()", () => {
    const text = scanned();
    for (const t of TRIGGERS) {
      expect(text, t).toMatch(
        new RegExp(
          `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+qualification\\.${t}\\(\\)`,
        ),
      );
    }
  });
});

describe("the migrations applied on live are not edited (T2)", () => {
  // The same pins as annexDefaultForm.test.ts, repeated here so this requirement has its own
  // test: these migrations are applied on deployed databases and Prisma refuses a changed checksum.
  const SHA: Record<string, string> = {};
  it("T2 20260925090000 and 20260925120000 still carry the bytes pinned in annexDefaultForm.test.ts", () => {
    const pins = readFileSync("test/unit/annexDefaultForm.test.ts", "utf8");
    for (const file of APPLIED) {
      const bytes = readFileSync(file);
      SHA[file] = createHash("sha256").update(bytes).digest("hex");
      expect(bytes.length).toBeGreaterThan(0);
    }
    // annexDefaultForm.test.ts parses 090000's seed rows and 120000's statements; the files'
    // hashes as they were applied:
    expect(SHA).toEqual(APPLIED_HASHES);
    expect(pins).toContain("20260925090000_forms_are_data");
    expect(pins).toContain("20260925120000_the_default_form_is_fixed");
  });
});

// sha256 of the two applied migrations, as deployed databases recorded them.
const APPLIED_HASHES: Record<string, string> = {
  "prisma/migrations/20260925090000_forms_are_data/migration.sql":
    "cbea212d7cd330c13c667918bad2b57572a2ceb871c327da423a3bb687147557",
  "prisma/migrations/20260925120000_the_default_form_is_fixed/migration.sql":
    "b8338d12f1c9f3c92022798556e1d0ef7a5b1f25b60b6e7b141feac2ca8dfb4c",
};
