import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { KEY_QUESTIONS } from "@/data/keyQuestions";
import * as legacyModule from "@/domain/forms/legacy";
import { FORM_BLOCKS, IDENTITY_FIELDS } from "@/domain/forms/blocks";

// The seeded "Annex IV default" questionnaire is KEY_QUESTIONS as data: the in-memory
// twin (annexDefaultVersion(): ResolvedQuestionnaireVersion) and the migration's seed must
// both say exactly what the constant says, or every card saved before forms existed would
// read back differently. The bytes of the applied migrations 20260925090000 and
// 20260925120000 are pinned by twoLevelMigration.test.ts.

// legacy.ts exports read through the module object, so a renamed or missing export fails the
// test that needs it, not the whole file.
const legacy = legacyModule as any;
const annexDefaultVersion = () => legacy.annexDefaultVersion();

const MIGRATION =
  "prisma/migrations/20260925090000_forms_are_data/migration.sql";

// The seed is applied and its bytes are pinned, so it keeps the section names it was written
// with; a later migration gives the builtin set the names KEY_QUESTIONS now uses.
const RELABEL =
  "prisma/migrations/20261020000000_default_section_names/migration.sql";
const SEEDED_LABEL: Record<string, string> = {
  "annex-1": "About the system",
  "annex-2": "How the system was built",
};

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
  it("FORM_BLOCKS is the 9 block ids in the spec's order", () => {
    expect([...FORM_BLOCKS]).toEqual(BLOCKS);
  });

  it("the identity block is the three fields no form can drop", () => {
    expect([...IDENTITY_FIELDS]).toEqual([
      "systemName",
      "systemVersion",
      "company",
    ]);
  });
});

describe("annexDefaultVersion(): the Annex IV default questionnaire, in memory", () => {
  it("the default questionnaire's constants", () => {
    expect(legacy.ANNEX_SET_ID).toBe("annex-iv");
    expect(legacy.ANNEX_SET_VERSION_ID).toBe("annex-iv-v1");
    expect(legacy.DEFAULT_QUESTIONNAIRE_ID).toBe("annex-iv-default");
    expect(legacy.DEFAULT_VERSION_ID).toBe("annex-iv-default-v1");
  });

  it("DEFAULT_FORM_ID is removed", () => {
    expect(legacy.DEFAULT_FORM_ID).toBeUndefined();
  });

  it("is the builtin questionnaire's version 1, named, described, listed, not retired, with every block", () => {
    const v = annexDefaultVersion();
    expect(Object.keys(v).sort()).toEqual(
      [
        "blocks",
        "builtin",
        "description",
        "listed",
        "questionnaireId",
        "questionnaireName",
        "questions",
        "retired",
        "versionId",
        "versionNumber",
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

  it("has the 14 questions in KEY_QUESTIONS order, each exactly as the constant has it, from set Annex IV v1", () => {
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

  it("returns a fresh value each call, so a caller cannot change the default for others", () => {
    const a = annexDefaultVersion();
    a.questions.pop();
    a.questions[0].text = "changed";
    expect(annexDefaultVersion().questions).toHaveLength(14);
    expect(annexDefaultVersion().questions[0].text).toBe(KEY_QUESTIONS[0].text);
  });
});

describe("resolveQuestionnaireVersionId", () => {
  it("a card with no questionnaire version (NULL) was filled with the default version", () => {
    expect(legacy.resolveQuestionnaireVersionId(null)).toBe(
      "annex-iv-default-v1",
    );
  });

  it("a card with a questionnaire version keeps it", () => {
    expect(legacy.resolveQuestionnaireVersionId("clx9abc-v2")).toBe(
      "clx9abc-v2",
    );
  });

  it("resolveFormVersionId is renamed", () => {
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

describe("the migration seeds the default form", () => {
  it("seeds the form row annex-iv-default, builtin, listed and the default", () => {
    const [form] = insertedRows(migration(), "form").filter(
      (r) => r.id === "annex-iv-default",
    );
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

  it("seeds version 1 with all 9 blocks in FORM_BLOCKS order", () => {
    const [version] = insertedRows(migration(), "form_version").filter(
      (r) => r.id === "annex-iv-default-v1",
    );
    expect(version).toMatchObject({ form_id: "annex-iv-default", number: 1 });
    const blocks = JSON.stringify(version.blocks);
    const at = BLOCKS.map((b) => blocks.indexOf(b));
    expect(at.every((p) => p >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("seeds one form_question per KEY_QUESTIONS entry, keyed (group, id)", () => {
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

  it("seeds one form_version_question per entry with its exact text, citation, required flag and position", () => {
    const rows = insertedRows(migration(), "form_version_question");
    KEY_QUESTIONS.forEach((k, position) => {
      const row = rows.find(
        (r) =>
          r.form_version_id === "annex-iv-default-v1" &&
          r.question_id === `annex-iv-${k.id}`,
      );
      expect(row, `form_version_question annex-iv-${k.id}`).toMatchObject({
        position,
        text: k.text,
        citation: k.citation,
        required: !k.optional,
        annex_point: k.id,
        group_label: SEEDED_LABEL[k.group],
      });
    });
  });
});

describe("the default questionnaire's section names", () => {
  const relabel = () => readFileSync(RELABEL, "utf8");

  it("are the reader's words, never the Annex", () => {
    const labels = [...new Set(KEY_QUESTIONS.map((k) => k.groupLabel))];
    expect(labels).toEqual(["General description", "Development and design"]);
  });

  it("a migration gives the builtin set's rows the names KEY_QUESTIONS uses, and only those rows", () => {
    const sql = relabel();
    for (const [group, seeded] of Object.entries(SEEDED_LABEL)) {
      const now = KEY_QUESTIONS.find((k) => k.group === group)!.groupLabel;
      expect(sql).toMatch(
        new RegExp(
          `SET group_label = '${now}'\\s+WHERE set_version_id = 'annex-iv-v1' AND group_label = '${seeded}';`,
        ),
      );
    }
  });

  it("puts the append-only guard back in the same file", () => {
    const sql = relabel();
    const off = sql.indexOf(
      "DISABLE TRIGGER question_set_version_item_is_append_only",
    );
    const on = sql.indexOf(
      "ENABLE TRIGGER question_set_version_item_is_append_only",
    );
    expect(off).toBeGreaterThan(-1);
    expect(on).toBeGreaterThan(off);
    expect(sql.slice(on)).not.toMatch(/UPDATE|INSERT|DELETE/);
  });
});

// That the schema has no model Form and the builtin rules live in the CHECKs on question_set and
// questionnaire is pinned by test/unit/twoLevelSchema.test.ts.
