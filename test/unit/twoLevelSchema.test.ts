import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Two-level forms (docs/superpowers/two-level-forms-2026-09-25/01-spec.md), T1: the Prisma schema
// has question sets and questionnaires (spec 3.3), and nothing of the form. Read as text, so it
// needs no generated client. Replaces the two "schema has no default flag" tests of
// annexDefaultForm.test.ts (spec 8.3): the Form model they read is gone.

const schema = () => readFileSync("prisma/schema.prisma", "utf8");

/** The body of `model <name> { ... }`, or null. */
function model(name: string): string | null {
  const m = new RegExp(`^model ${name} \\{\\n([\\s\\S]*?)^\\}`, "m").exec(schema());
  return m ? m[1] : null;
}

/** Field lines of a model body: name -> the rest of the line (type and attributes). */
function fields(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of body.split("\n")) {
    const line = raw.replace(/\/\/.*$/, "").trim();
    if (line === "" || line.startsWith("@@") || line.startsWith("///")) continue;
    const m = /^(\w+)\s+(.*)$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/** Block attributes of a model body, whitespace collapsed. */
function blockAttributes(body: string): string[] {
  return body
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").trim())
    .filter((l) => l.startsWith("@@"))
    .map((l) => l.replace(/\s+/g, " "));
}

type FieldSpec = { type: RegExp; map?: string };

// spec 3.3, field by field: the type (with optionality or list) and the column it maps to.
const MODELS: Record<string, { table: string; fields: Record<string, FieldSpec>; attributes: RegExp[] }> = {
  QuestionSet: {
    table: "question_set",
    fields: {
      id: { type: /^String\s+@id @default\(cuid\(\)\)/ },
      name: { type: /^String\b/ },
      description: { type: /^String\s+@default\(""\)/ },
      origin: { type: /^String\b/ },
      retiredAt: { type: /^DateTime\?/, map: "retired_at" },
      createdAt: { type: /^DateTime\s+@default\(now\(\)\)/, map: "created_at" },
      createdBy: { type: /^String\b/, map: "created_by" },
      versions: { type: /^QuestionSetVersion\[\]/ },
      questions: { type: /^Question\[\]/ },
    },
    attributes: [],
  },
  QuestionSetVersion: {
    table: "question_set_version",
    fields: {
      id: { type: /^String\s+@id @default\(cuid\(\)\)/ },
      setId: { type: /^String\b/, map: "set_id" },
      number: { type: /^Int\b/ },
      createdAt: { type: /^DateTime\s+@default\(now\(\)\)/, map: "created_at" },
      createdBy: { type: /^String\b/, map: "created_by" },
      set: { type: /^QuestionSet\s+@relation\(fields: \[setId\], references: \[id\], onDelete: Restrict\)/ },
      items: { type: /^QuestionSetVersionItem\[\]/ },
    },
    attributes: [/^@@unique\(\[setId, number\], map: "question_set_version_set_id_number_key"\)$/],
  },
  Question: {
    table: "question",
    fields: {
      id: { type: /^String\s+@id @default\(cuid\(\)\)/ },
      setId: { type: /^String\b/, map: "set_id" },
      scope: { type: /^String\b/ },
      localId: { type: /^String\b/, map: "local_id" },
      createdAt: { type: /^DateTime\s+@default\(now\(\)\)/, map: "created_at" },
      set: { type: /^QuestionSet\s+@relation\(fields: \[setId\], references: \[id\], onDelete: Restrict\)/ },
      items: { type: /^QuestionSetVersionItem\[\]/ },
    },
    attributes: [
      /^@@unique\(\[scope, localId\], map: "question_scope_local_id_key"\)$/,
      /^@@index\(\[setId\], map: "question_set_id_idx"\)$/,
    ],
  },
  QuestionSetVersionItem: {
    table: "question_set_version_item",
    fields: {
      setVersionId: { type: /^String\b/, map: "set_version_id" },
      questionId: { type: /^String\b/, map: "question_id" },
      position: { type: /^Int\b/ },
      text: { type: /^String\b/ },
      citation: { type: /^String\s+@default\(""\)/ },
      required: { type: /^Boolean\b/ },
      annexPoint: { type: /^String\?/, map: "annex_point" },
      groupLabel: { type: /^String\?/, map: "group_label" },
      setVersion: {
        type: /^QuestionSetVersion\s+@relation\(fields: \[setVersionId\], references: \[id\], onDelete: Restrict\)/,
      },
      question: { type: /^Question\s+@relation\(fields: \[questionId\], references: \[id\], onDelete: Restrict\)/ },
      usedBy: { type: /^QuestionnaireVersionItem\[\]/ },
    },
    attributes: [
      /^@@id\(\[setVersionId, questionId\], map: "question_set_version_item_pkey"\)$/,
      /^@@unique\(\[setVersionId, position\], map: "question_set_version_item_set_version_id_position_key"\)$/,
      /^@@index\(\[questionId\], map: "question_set_version_item_question_id_idx"\)$/,
    ],
  },
  Questionnaire: {
    table: "questionnaire",
    fields: {
      id: { type: /^String\s+@id @default\(cuid\(\)\)/ },
      name: { type: /^String\b/ },
      description: { type: /^String\s+@default\(""\)/ },
      origin: { type: /^String\b/ },
      listed: { type: /^Boolean\s+@default\(true\)/ },
      retiredAt: { type: /^DateTime\?/, map: "retired_at" },
      createdAt: { type: /^DateTime\s+@default\(now\(\)\)/, map: "created_at" },
      createdBy: { type: /^String\b/, map: "created_by" },
      versions: { type: /^QuestionnaireVersion\[\]/ },
    },
    attributes: [],
  },
  QuestionnaireVersion: {
    table: "questionnaire_version",
    fields: {
      id: { type: /^String\s+@id @default\(cuid\(\)\)/ },
      questionnaireId: { type: /^String\b/, map: "questionnaire_id" },
      number: { type: /^Int\b/ },
      blocks: { type: /^String\[\]/ },
      createdAt: { type: /^DateTime\s+@default\(now\(\)\)/, map: "created_at" },
      createdBy: { type: /^String\b/, map: "created_by" },
      questionnaire: {
        type: /^Questionnaire\s+@relation\(fields: \[questionnaireId\], references: \[id\], onDelete: Restrict\)/,
      },
      items: { type: /^QuestionnaireVersionItem\[\]/ },
      qualifications: { type: /^Qualification\[\]/ },
    },
    attributes: [
      /^@@unique\(\[questionnaireId, number\], map: "questionnaire_version_questionnaire_id_number_key"\)$/,
    ],
  },
  QuestionnaireVersionItem: {
    table: "questionnaire_version_item",
    fields: {
      questionnaireVersionId: { type: /^String\b/, map: "questionnaire_version_id" },
      position: { type: /^Int\b/ },
      setVersionId: { type: /^String\b/, map: "set_version_id" },
      questionId: { type: /^String\b/, map: "question_id" },
      questionnaireVersion: {
        type: /^QuestionnaireVersion\s+@relation\(fields: \[questionnaireVersionId\], references: \[id\], onDelete: Restrict\)/,
      },
      setItem: {
        type: /^QuestionSetVersionItem\s+@relation\(fields: \[setVersionId, questionId\], references: \[setVersionId, questionId\], onDelete: Restrict, map: "questionnaire_version_item_set_item_fkey"\)/,
      },
    },
    attributes: [
      /^@@id\(\[questionnaireVersionId, questionId\], map: "questionnaire_version_item_pkey"\)$/,
      // Spec 3.3 names this index questionnaire_version_item_questionnaire_version_id_position_key, which is
      // 64 bytes: Prisma refuses it (at most 63, `prisma validate` fails) and Postgres would cut it to 63.
      // So only the key and a name that fits are pinned here; the name must equal the migration's index.
      /^@@unique\(\[questionnaireVersionId, position\], map: "questionnaire_version_item_\w+"\)$/,
      /^@@index\(\[setVersionId, questionId\], map: "questionnaire_version_item_set_version_id_question_id_idx"\)$/,
    ],
  },
};

describe("the Prisma schema has the two levels (T1)", () => {
  for (const [name, spec] of Object.entries(MODELS)) {
    it(`T1 model ${name} exists, maps to qualification.${spec.table}, with the fields of spec 3.3`, () => {
      const body = model(name);
      expect(body, `model ${name}`).not.toBeNull();
      const f = fields(body!);
      // exactly these fields: none missing, none extra
      expect(Object.keys(f).sort()).toEqual(Object.keys(spec.fields).sort());
      for (const [field, want] of Object.entries(spec.fields)) {
        const line = f[field].replace(/\s+/g, " ");
        expect(line, `${name}.${field}`).toMatch(want.type);
        const mapped = /@map\("([^"]+)"\)/.exec(line)?.[1];
        expect(mapped, `${name}.${field} @map`).toBe(want.map);
      }
      const attrs = blockAttributes(body!);
      expect(attrs).toContain(`@@map("${spec.table}")`);
      for (const a of spec.attributes) {
        expect(attrs.some((x) => a.test(x)), `${name}: ${a}`).toBe(true);
      }
    });
  }

  it("T1 every map name of the seven models fits Postgres' 63 bytes, and the questionnaire item position key is the migration's index", () => {
    const names: string[] = [];
    for (const name of Object.keys(MODELS)) {
      for (const m of (model(name) ?? "").matchAll(/map: "([^"]+)"/g)) names.push(m[1]);
    }
    expect(names.length).toBeGreaterThan(10);
    for (const n of names) expect(n.length, n).toBeLessThanOrEqual(63);
    const key = /@@unique\(\[questionnaireVersionId, position\], map: "([^"]+)"\)/.exec(model("QuestionnaireVersionItem") ?? "")?.[1];
    expect(key).toBeDefined();
    const migration = "prisma/migrations/20260925150000_two_level_forms/migration.sql";
    expect(existsSync(migration)).toBe(true);
    expect(readFileSync(migration, "utf8")).toMatch(
      new RegExp(`CREATE UNIQUE INDEX ${key}\\s+ON qualification\\.questionnaire_version_item \\(questionnaire_version_id, position\\)`),
    );
  });

  it("T1 npx prisma validate passes (dummy DATABASE_URL)", () => {
    const r = spawnSync("npx", ["prisma", "validate"], {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: "postgresql://x:x@127.0.0.1:1/x?schema=qualification" },
    });
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
    // A child process: npx starting the Prisma CLI takes seconds, and under a full parallel run it
    // crossed vitest's 5 s default (2026-09-30), which failed a schema that validates.
  }, 60_000);

  it("T1 the timestamps of the seven models are timestamptz(3)", () => {
    for (const name of Object.keys(MODELS)) {
      const f = fields(model(name) ?? "");
      for (const field of ["createdAt", "retiredAt"]) {
        if (f[field]) expect(f[field], `${name}.${field}`).toMatch(/@db\.Timestamptz\(3\)/);
      }
    }
  });

  it("T1 no model Form, FormVersion, FormQuestion or FormVersionQuestion remains", () => {
    for (const name of ["Form", "FormVersion", "FormQuestion", "FormVersionQuestion"]) {
      expect(model(name), `model ${name}`).toBeNull();
    }
  });

  it("T1 Qualification has questionnaireVersionId mapped to questionnaire_version_id and no formVersionId", () => {
    const body = model("Qualification");
    expect(body).not.toBeNull();
    const f = fields(body!);
    expect(f.formVersionId).toBeUndefined();
    expect(f.formVersion).toBeUndefined();
    expect(f.questionnaireVersionId?.replace(/\s+/g, " ")).toMatch(/^String\? @map\("questionnaire_version_id"\)$/);
    expect(f.questionnaireVersion?.replace(/\s+/g, " ")).toMatch(
      /^QuestionnaireVersion\? @relation\(fields: \[questionnaireVersionId\], references: \[id\], onDelete: Restrict, map: "qualification_questionnaire_version_id_fkey"\)$/,
    );
    const attrs = blockAttributes(body!);
    expect(attrs).toContain('@@index([questionnaireVersionId], map: "qualification_questionnaire_version_id_idx")');
    expect(attrs.some((a) => a.includes("formVersionId"))).toBe(false);
  });

  it("T1 no field of the seven models mentions a project (install-wide, 06 R47)", () => {
    for (const name of Object.keys(MODELS)) {
      const body = model(name);
      expect(body, `model ${name}`).not.toBeNull();
      for (const field of Object.keys(fields(body!))) {
        expect(field.toLowerCase(), `${name}.${field}`).not.toContain("project");
      }
      expect(body!.toLowerCase().replace(/\/\/\/.*$/gm, "")).not.toMatch(/project/);
    }
  });

  it("T1 no model has a default flag (the default is the constant annex-iv-default)", () => {
    const text = schema();
    expect(text).not.toMatch(/isDefault|is_default/);
  });
});
