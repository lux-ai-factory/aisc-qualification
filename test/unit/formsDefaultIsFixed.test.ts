import { describe, it, expect, vi } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Nothing can change the default questionnaire, and the services are never given a
// project (the project is the database). Source scans and prototype
// checks, like oneSystemEntryPoints.test.ts.

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
    return statSync(path).isDirectory()
      ? sources(path)
      : /\.(tsx?|mjs|js|json)$/.test(name)
        ? [path]
        : [];
  });
}

// The service and repository scans cover question sets and questionnaires.
const SERVICES = [
  "src/server/services/QuestionSetService.ts",
  "src/server/services/QuestionnaireService.ts",
];
const REPOSITORIES = [
  "src/server/repositories/QuestionSetRepository.ts",
  "src/server/repositories/QuestionnaireRepository.ts",
];

describe("nothing can change the default", () => {
  it("no service or repository of either level has a setDefault method", async () => {
    const { resolve } = await import("node:path");
    const load = (f: string) => import(/* @vite-ignore */ resolve(f));
    const { QuestionSetService } = await load(SERVICES[0]);
    const { QuestionnaireService } = await load(SERVICES[1]);
    const { QuestionSetRepository } = await load(REPOSITORIES[0]);
    const { QuestionnaireRepository } = await load(REPOSITORIES[1]);
    for (const cls of [
      QuestionSetService,
      QuestionnaireService,
      QuestionSetRepository,
      QuestionnaireRepository,
    ]) {
      expect(typeof cls).toBe("function");
      expect("setDefault" in cls.prototype).toBe(false);
    }
  });

  it.each([
    "setDefault",
    "is_default",
    "Set as default",
    "Only an administrator can change the default form.",
  ])("no file under src/ or prisma/schema.prisma contains %j", (needle) => {
    const hits = [...sources("src"), "prisma/schema.prisma"].filter((f) =>
      readFileSync(f, "utf8").includes(needle),
    );
    expect(hits).toEqual([]);
  });
});

describe("one install-wide library", () => {
  it.each([...SERVICES, ...REPOSITORIES])(
    "%s has no public method with a project or projectId parameter",
    (file) => {
      const src = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      const methods = [
        ...src.matchAll(
          /^\s{2}(?:public\s+|async\s+|static\s+)*(?!private\b)([a-zA-Z]\w*)\s*\(([^)]*)\)/gm,
        ),
      ];
      expect(methods.length).toBeGreaterThan(0);
      const offending = methods
        .filter(([, , params]) =>
          /(^|[\s,(])_?project(Id)?\s*[?:,)=]|(^|[\s,(])_?project(Id)?\s*$/m.test(
            params,
          ),
        )
        .map(([, name]) => name);
      expect(offending).toEqual([]);
    },
  );

  it.each([...SERVICES, ...REPOSITORIES])(
    "%s does not mention projectId or project_id",
    (file) => {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/projectId|project_id/);
    },
  );
});
