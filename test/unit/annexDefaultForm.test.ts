import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { KEY_QUESTIONS } from "@/data/keyQuestions";
import * as legacyModule from "@/domain/forms/legacy";
import { FORM_BLOCKS, IDENTITY_FIELDS } from "@/domain/forms/blocks";

// The seeded "Annex IV default" questionnaire is KEY_QUESTIONS as data: the in-memory
// twins (annexDefaultVersion(): ResolvedQuestionnaireVersion and annexSetVersion():
// ResolvedSetVersion) and the migration's seed must both say exactly what the constant
// says, or every card saved before forms existed would read back differently. The texts
// of the applied migrations 20260925090000 and 20260925120000 are pinned unchanged.

// legacy.ts exports read through the module object, so a renamed or missing export fails the
// test that needs it, not the whole file.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const legacy = legacyModule as any;
const annexDefaultVersion = () => legacy.annexDefaultVersion();

const MIGRATION = "prisma/migrations/20260925090000_forms_are_data/migration.sql";

const BLOCKS = [
  "description",
  "targetUseCase",
  "targetUsers",
  "intendedDeployers",
  "targetSystemTags",
  "sectorTags",
  "marketFormTags",
  "localityTags",
  "risks",
];

describe("the blocks (spec section 3)", () => {
  it("R1 FORM_BLOCKS is the 9 block ids in the spec's order", () => {
    expect([...FORM_BLOCKS]).toEqual(BLOCKS);
  });

  it("R10 the identity block is the three fields no form can drop", () => {
    expect([...IDENTITY_FIELDS]).toEqual(["systemName", "systemVersion", "company"]);
  });
});

describe("annexDefaultVersion(): the Annex IV default questionnaire, in memory (T3)", () => {
  it("T3 the constants of spec 3.4", () => {
    expect(legacy.ANNEX_SET_ID).toBe("annex-iv");
    expect(legacy.ANNEX_SET_VERSION_ID).toBe("annex-iv-v1");
    expect(legacy.DEFAULT_QUESTIONNAIRE_ID).toBe("annex-iv-default");
    expect(legacy.DEFAULT_VERSION_ID).toBe("annex-iv-default-v1");
  });

  it("T3 DEFAULT_FORM_ID is removed", () => {
    expect(legacy.DEFAULT_FORM_ID).toBeUndefined();
  });

  it("T3 is the builtin questionnaire's version 1, named, described, listed, not retired, with every block", () => {
    const v = annexDefaultVersion();
    expect(Object.keys(v).sort()).toEqual(
      [
        "blocks", "builtin", "description", "listed", "questionnaireId", "questionnaireName", "questions",
        "retired", "versionId", "versionNumber",
      ].sort(),
    );
    expect(v).toMatchObject({
      questionnaireId: "annex-iv-default",
      questionnaireName: "Annex IV default",
      description: "EU AI Act Annex IV points 1 and 2, as 14 questions.",
      listed: true,
      builtin: true,
      retired: false,
      versionId: "annex-iv-default-v1",
      versionNumber: 1,
    });
    expect(v.blocks).toEqual(BLOCKS);
  });

  it("T3 has the 14 questions in KEY_QUESTIONS order, each exactly as the constant has it, from set Annex IV v1", () => {
    const v = annexDefaultVersion();
    expect(v.questions).toHaveLength(14);
    v.questions.forEach((q: unknown, i: number) => {
      const k = KEY_QUESTIONS[i];
      expect(q).toEqual({
        questionId: `annex-iv-${k.id}`,
        scope: k.group,
        localId: k.id,
        key: `${k.group}:${k.id}`,
        field: `q:${k.group}:${k.id}`,
        text: k.text,
        citation: k.citation,
        required: !k.optional,
        annexPoint: k.id,
        groupLabel: k.groupLabel,
        setId: "annex-iv",
        setName: "Annex IV",
        setVersionId: "annex-iv-v1",
        setVersionNumber: 1,
        setBuiltin: true,
      });
    });
  });

  it("T3 R1 returns a fresh value each call, so a caller cannot change the default for others", () => {
    const a = annexDefaultVersion();
    a.questions.pop();
    a.questions[0].text = "changed";
    expect(annexDefaultVersion().questions).toHaveLength(14);
    expect(annexDefaultVersion().questions[0].text).toBe(KEY_QUESTIONS[0].text);
  });
});

describe("annexSetVersion(): the builtin question set, in memory (T3)", () => {
  it("T3 is set Annex IV v1, builtin, not retired, with the same 14 questions as the default questionnaire", () => {
    const s = legacy.annexSetVersion();
    expect(s).toMatchObject({
      setId: "annex-iv",
      setName: "Annex IV",
      description: "EU AI Act Annex IV points 1 and 2, as 14 questions.",
      origin: "builtin",
      builtin: true,
      retired: false,
      versionId: "annex-iv-v1",
      versionNumber: 1,
    });
    expect(s.questions).toEqual(annexDefaultVersion().questions);
  });

  it("T3 returns a fresh value each call", () => {
    const a = legacy.annexSetVersion();
    a.questions.length = 0;
    expect(legacy.annexSetVersion().questions).toHaveLength(14);
  });
});

describe("resolveQuestionnaireVersionId (spec 3.1, 4.3)", () => {
  it("T3 a card with no questionnaire version (NULL) was filled with the default version", () => {
    expect(legacy.resolveQuestionnaireVersionId(null)).toBe("annex-iv-default-v1");
  });

  it("T3 a card with a questionnaire version keeps it", () => {
    expect(legacy.resolveQuestionnaireVersionId("clx9abc-v2")).toBe("clx9abc-v2");
  });

  it("T3 resolveFormVersionId is renamed", () => {
    expect(legacy.resolveFormVersionId).toBeUndefined();
  });
});

// The migration, read as text

/** One SQL literal: a string (with '' unescaped), a number, a boolean, NULL, or raw text. */
type Lit = string | number | boolean | null | { raw: string };

/**
 * The rows of every `INSERT INTO <schema.>table (cols) VALUES (...), (...)` in
 * the file, as objects keyed by column. Enough SQL to read a seed written as
 * literal VALUES rows.
 */
function insertedRows(sql: string, table: string): Record<string, Lit>[] {
  const rows: Record<string, Lit>[] = [];
  const head = new RegExp(
    `INSERT\\s+INTO\\s+(?:"?qualification"?\\.)?"?${table}"?\\s*\\(([^)]*)\\)\\s*VALUES`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = head.exec(sql))) {
    const cols = m[1].split(",").map((c) => c.trim().replace(/"/g, ""));
    let i = head.lastIndex;
    // read tuples until the statement ends
    for (;;) {
      while (/\s|,/.test(sql[i])) i++;
      if (sql[i] !== "(") break;
      i++;
      const values: Lit[] = [];
      let depth = 0;
      let raw = "";
      const push = () => {
        const t = raw.trim();
        if (t !== "") values.push(literal(t));
        raw = "";
      };
      for (;;) {
        const c = sql[i];
        if (c === "'") {
          // a string literal, '' is an escaped quote
          let s = "";
          i++;
          for (;;) {
            if (sql[i] === "'" && sql[i + 1] === "'") {
              s += "'";
              i += 2;
            } else if (sql[i] === "'") {
              i++;
              break;
            } else {
              s += sql[i++];
            }
          }
          if (raw.trim() === "" && depth === 0) {
            values.push(s);
            raw = "";
            // skip a cast such as ::text[]
            while (sql[i] === ":" || /[\w\[\]]/.test(sql[i] ?? "")) i++;
          } else {
            raw += `'${s.replace(/'/g, "''")}'`;
          }
          continue;
        }
        if (c === "(" || c === "[") depth++;
        if ((c === ")" || c === "]") && depth > 0) {
          depth--;
          raw += c;
          i++;
          continue;
        }
        if (c === ")" && depth === 0) {
          push();
          i++;
          break;
        }
        if (c === "," && depth === 0) {
          push();
          i++;
          continue;
        }
        raw += c;
        i++;
      }
      rows.push(Object.fromEntries(cols.map((c, k) => [c, values[k]])));
    }
    head.lastIndex = i;
  }
  return rows;
}

function literal(t: string): Lit {
  if (/^null$/i.test(t)) return null;
  if (/^true$/i.test(t)) return true;
  if (/^false$/i.test(t)) return false;
  if (/^-?\d+$/.test(t)) return Number(t);
  return { raw: t };
}

const migration = () => {
  expect(existsSync(MIGRATION), `${MIGRATION} exists`).toBe(true);
  return readFileSync(MIGRATION, "utf8");
};

describe("the migration seeds the default form (R1, spec 4.3)", () => {
  it("R1 seeds the form row annex-iv-default, builtin, listed and the default", () => {
    const [form] = insertedRows(migration(), "form").filter((r) => r.id === "annex-iv-default");
    expect(form).toBeTruthy();
    expect(form).toMatchObject({
      id: "annex-iv-default",
      name: "Annex IV default",
      origin: "builtin",
      listed: true,
      is_default: true,
      description: "EU AI Act Annex IV points 1 and 2, as 14 questions.",
    });
  });

  it("R1 seeds version 1 with all 9 blocks in FORM_BLOCKS order", () => {
    const [version] = insertedRows(migration(), "form_version").filter(
      (r) => r.id === "annex-iv-default-v1",
    );
    expect(version).toMatchObject({ form_id: "annex-iv-default", number: 1 });
    const blocks = JSON.stringify(version.blocks);
    const at = BLOCKS.map((b) => blocks.indexOf(b));
    expect(at.every((p) => p >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("R1 seeds one form_question per KEY_QUESTIONS entry, keyed (group, id)", () => {
    const rows = insertedRows(migration(), "form_question");
    for (const k of KEY_QUESTIONS) {
      const row = rows.find((r) => r.id === `annex-iv-${k.id}`);
      expect(row, `form_question annex-iv-${k.id}`).toMatchObject({
        owner_form_id: "annex-iv-default",
        scope: k.group,
        local_id: k.id,
      });
    }
  });

  it("R1 seeds one form_version_question per entry with its exact text, citation, required flag and position", () => {
    const rows = insertedRows(migration(), "form_version_question");
    KEY_QUESTIONS.forEach((k, position) => {
      const row = rows.find(
        (r) => r.form_version_id === "annex-iv-default-v1" && r.question_id === `annex-iv-${k.id}`,
      );
      expect(row, `form_version_question annex-iv-${k.id}`).toMatchObject({
        position,
        text: k.text,
        citation: k.citation,
        required: !k.optional,
        annex_point: k.id,
        group_label: k.groupLabel,
      });
    });
  });
});

describe("the migration's shape (spec 4.2, 4.3; checked in a DB by test/db/forms.db.test.ts)", () => {
  it("R4 R5 R6 names the constraints and triggers the spec names", () => {
    const sql = migration();
    for (const name of [
      "form_one_default",
      "form_listed_name_key",
      "form_version_is_append_only",
      "form_version_question_is_append_only",
      "form_question_identity_is_fixed",
      "form_name_is_fixed",
      "form_builtin_is_fixed",
      "qualification_form_version_id_idx",
      "qualification_answer_qualification_id_tool_id_question_id_key",
    ]) {
      expect(sql, name).toContain(name);
    }
    expect(sql).toMatch(/DROP INDEX\s+(IF EXISTS\s+)?qualification\."QualificationAnswer_qualificationId_questionId_key"/);
  });

  it("R7 updates and deletes no existing row: history stays byte-identical", () => {
    const sql = migration().replace(/--[^\n]*/g, "");
    // Trigger event lists say UPDATE/DELETE; no statement may touch these tables.
    const history =
      '(?:"?qualification"?\\.)?"?(?:qualification|qualification_answer|qualification_risk|knowledge_graph|card_component)"?';
    expect(sql).not.toMatch(new RegExp(`\\bUPDATE\\s+(?:ONLY\\s+)?${history}\\s+SET\\b`, "i"));
    expect(sql).not.toMatch(new RegExp(`\\bDELETE\\s+FROM\\s+(?:ONLY\\s+)?${history}(?:\\s|;|$)`, "i"));
    expect(sql).not.toMatch(new RegExp(`\\bTRUNCATE\\s+(?:TABLE\\s+)?${history}`, "i"));
    // The new column has no default and no backfill.
    expect(sql).toMatch(/ADD COLUMN\s+form_version_id\s+text\s+NULL/i);
  });

  it("R6 creates the triggers after the seed, so the seed is not refused", () => {
    const sql = migration();
    const seed = sql.indexOf("annex-iv-default-v1");
    const trigger = sql.search(/CREATE\s+(OR REPLACE\s+)?TRIGGER\s+form_builtin_is_fixed/i);
    expect(seed).toBeGreaterThan(-1);
    expect(trigger).toBeGreaterThan(seed);
  });
});

// The forward migration that removes the default flag

const FIXED = "prisma/migrations/20260925120000_the_default_form_is_fixed/migration.sql";

describe("the forward migration 20260925120000_the_default_form_is_fixed (R45)", () => {
  const text = () => readFileSync(FIXED, "utf8");
  /** comments stripped, whitespace collapsed */
  const flat = () => text().replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();

  it("R45 exists", () => {
    expect(existsSync(FIXED)).toBe(true);
  });

  it("R45 holds the statements of addendum section 3.2, in that order", () => {
    const sql = flat();
    const statements = [
      "DROP INDEX qualification.form_one_default;",
      "ALTER TABLE qualification.form DROP CONSTRAINT form_default_is_listed;",
      "ALTER TABLE qualification.form DROP COLUMN is_default;",
      "ALTER TABLE qualification.form ADD CONSTRAINT form_builtin_is_the_default CHECK (origin <> 'builtin' OR (id = 'annex-iv-default' AND listed));",
      "CREATE OR REPLACE FUNCTION qualification.form_name_is_fixed() RETURNS trigger LANGUAGE plpgsql AS $$",
      "IF NEW.name IS DISTINCT FROM OLD.name OR NEW.origin IS DISTINCT FROM OLD.origin OR NEW.listed IS DISTINCT FROM OLD.listed THEN",
      "RAISE EXCEPTION 'form % keeps its name, origin and listing: only its description changes', OLD.id;",
      "RETURN NEW;",
      "END $$;",
    ];
    let at = -1;
    for (const st of statements) {
      const i = sql.indexOf(st, at + 1);
      expect(i, st).toBeGreaterThan(at);
      at = i;
    }
  });

  it("R45 no UPDATE, DELETE, TRUNCATE, BEGIN, COMMIT, CONCURRENTLY or IF EXISTS outside the function body", () => {
    // The plpgsql body between $$ ... $$ has its own BEGIN ... END; what is
    // refused is a transaction or a data change around it.
    const outside = flat().replace(/\$\$[\s\S]*?\$\$/g, "$$ $$");
    for (const word of ["UPDATE", "DELETE", "TRUNCATE", "BEGIN", "COMMIT", "CONCURRENTLY", "IF EXISTS"]) {
      expect(outside, word).not.toMatch(new RegExp(`\\b${word}\\b`, "i"));
    }
    // and the body changes no row either
    expect(flat()).not.toMatch(/\b(UPDATE|DELETE|TRUNCATE)\b/i);
  });

  it("R45 adds and drops no trigger, so the R7 DB test can still revert and re-apply 090000", () => {
    const sql = flat();
    expect(sql).not.toMatch(/\b(CREATE|DROP)\s+TRIGGER\b/i);
  });

  it("R45 the 090000 migration is not edited: its bytes are the ones round 1 shipped", async () => {
    const { createHash } = await import("node:crypto");
    const digest = createHash("sha256").update(readFileSync(MIGRATION)).digest("hex");
    expect(digest).toBe("cbea212d7cd330c13c667918bad2b57572a2ceb871c327da423a3bb687147557");
  });
});

// That the schema has no model Form and the builtin rules live in the CHECKs on question_set and
// questionnaire is pinned by test/unit/twoLevelSchema.test.ts.
