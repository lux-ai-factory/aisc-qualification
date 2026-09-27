import { describe, it, expect, vi } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Addendum 06 (docs/superpowers/form-assembly-2026-09-24/06-spec-addendum.md):
// R44 nothing can change the default form, R47 no form is scoped to a project.
// Source scans and prototype checks, like oneSystemEntryPoints.test.ts.

// The project doors let these calls through: which project's database a forms page, action or
// route opens, and who may, is pinned by isolationForms.test.ts.
vi.mock("@/lib/projectDb", () => ({
  projectDbPastDoor: async () => ({}),
  projectDbForAction: async () => ({ db: {} }),
  projectDbForRoute: async () => ({}),
}));

function sources(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : /\.(tsx?|mjs|js|json)$/.test(name) ? [path] : [];
  });
}

// Two-level forms (docs/superpowers/two-level-forms-2026-09-25/01-spec.md, 8.3, T30, T63): the
// actions are the questionnaire actions (the default is a questionnaire); the service and
// repository scans cover both levels; the R47 models are the seven new models. The setDefault
// scans are unchanged.
const ACTIONS = "src/app/p/[project]/questionnaires/actions.ts";
const SERVICES = ["src/server/services/QuestionSetService.ts", "src/server/services/QuestionnaireService.ts"];
const REPOSITORIES = [
  "src/server/repositories/QuestionSetRepository.ts",
  "src/server/repositories/QuestionnaireRepository.ts",
];

describe("nothing can change the default (R44)", () => {
  it("R44 T30 the questionnaire actions export exactly saveQuestionnaire, useQuestionnaireOnce and retireQuestionnaire", () => {
    const exported = [...readFileSync(ACTIONS, "utf8").matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map(
      (m) => m[1],
    );
    expect(exported.sort()).toEqual(["retireQuestionnaire", "saveQuestionnaire", "useQuestionnaireOnce"]);
    expect(readFileSync(ACTIONS, "utf8")).not.toMatch(/export\s+(const|let|var|default)\b/);
  });

  it("R44 SetDefaultButton.tsx does not exist", () => {
    expect(existsSync("src/app/p/[project]/forms/SetDefaultButton.tsx")).toBe(false);
  });

  it("R44 T63 no service or repository of either level has a setDefault method", async () => {
    const { resolve } = await import("node:path");
    const load = (f: string) => import(/* @vite-ignore */ resolve(f));
    const { QuestionSetService } = await load(SERVICES[0]);
    const { QuestionnaireService } = await load(SERVICES[1]);
    const { QuestionSetRepository } = await load(REPOSITORIES[0]);
    const { QuestionnaireRepository } = await load(REPOSITORIES[1]);
    for (const cls of [QuestionSetService, QuestionnaireService, QuestionSetRepository, QuestionnaireRepository]) {
      expect(typeof cls).toBe("function");
      expect("setDefault" in cls.prototype).toBe(false);
    }
  });

  it.each(["setDefault", "is_default", "Set as default", "Only an administrator can change the default form."])(
    "R44 no file under src/ or prisma/schema.prisma contains %j",
    (needle) => {
      const hits = [...sources("src"), "prisma/schema.prisma"].filter((f) => readFileSync(f, "utf8").includes(needle));
      expect(hits).toEqual([]);
    },
  );

  it("R44 prisma/schema.prisma has no isDefault field", () => {
    expect(readFileSync("prisma/schema.prisma", "utf8")).not.toMatch(/^\s*isDefault\s/m);
  });
});

describe("one install-wide library (R47)", () => {
  const schema = () => readFileSync("prisma/schema.prisma", "utf8");
  const model = (name: string) => {
    const m = new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`).exec(schema());
    expect(m, name).not.toBeNull();
    return m![1];
  };

  it.each([
    "QuestionSet",
    "QuestionSetVersion",
    "Question",
    "QuestionSetVersionItem",
    "Questionnaire",
    "QuestionnaireVersion",
    "QuestionnaireVersionItem",
  ])(
    "R47 T63 model %s has no field whose name contains project",
    (name) => {
      const fields = model(name)
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("//") && !l.startsWith("@@"))
        .map((l) => l.split(/\s+/)[0]);
      expect(fields.filter((f) => /project/i.test(f))).toEqual([]);
    },
  );

  it("R47 neither migration creates a column whose name contains project on the four form tables", () => {
    const files = [
      "prisma/migrations/20260925090000_forms_are_data/migration.sql",
      "prisma/migrations/20260925120000_the_default_form_is_fixed/migration.sql",
    ];
    for (const f of files) expect(existsSync(f), f).toBe(true);
    const tables = "form|form_version|form_question|form_version_question";
    for (const f of files) {
      const sql = readFileSync(f, "utf8").replace(/--[^\n]*/g, "");
      for (const m of sql.matchAll(new RegExp(`CREATE TABLE qualification\\.(${tables}) \\(([\\s\\S]*?)\\n\\);`, "g"))) {
        expect(m[2], `${f}: ${m[1]}`).not.toMatch(/project/i);
      }
      for (const m of sql.matchAll(new RegExp(`ALTER TABLE qualification\\.(${tables})\\b([^;]*);`, "g"))) {
        expect(m[2], `${f}: ${m[1]}`).not.toMatch(/ADD COLUMN[^,;]*project/i);
      }
    }
  });

  it.each([...SERVICES, ...REPOSITORIES])("R47 T63 %s has no public method with a project or projectId parameter", (file) => {
    const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const methods = [
      ...src.matchAll(/^\s{2}(?:public\s+|async\s+|static\s+)*(?!private\b)([a-zA-Z]\w*)\s*\(([^)]*)\)/gm),
    ];
    expect(methods.length).toBeGreaterThan(0);
    const offending = methods
      .filter(([, , params]) => /(^|[\s,(])_?project(Id)?\s*[?:,)=]|(^|[\s,(])_?project(Id)?\s*$/m.test(params))
      .map(([, name]) => name);
    expect(offending).toEqual([]);
  });

  it.each([...SERVICES, ...REPOSITORIES])("R47 T63 %s does not mention projectId or project_id", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).not.toMatch(/projectId|project_id/);
  });

  it("T63 the two-level migration creates no column whose name contains project on the seven new tables", () => {
    const f = "prisma/migrations/20260925150000_two_level_forms/migration.sql";
    expect(existsSync(f), f).toBe(true);
    const sql = readFileSync(f, "utf8").replace(/--[^\n]*/g, "");
    const tables =
      "question_set|question_set_version|question|question_set_version_item|questionnaire|questionnaire_version|questionnaire_version_item";
    const created = [...sql.matchAll(new RegExp(`CREATE TABLE qualification\\.(${tables}) \\(([\\s\\S]*?)\\n\\);`, "g"))];
    expect(created.map((m) => m[1]).sort()).toEqual(tables.split("|").sort());
    for (const m of created) expect(m[2], m[1]).not.toMatch(/project/i);
  });
});
