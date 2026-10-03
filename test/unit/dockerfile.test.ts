import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// The image never pushes the schema with `db push --accept-data-loss`, which would drop the
// form tables' data without a migration. Each project database is migrated by
// scripts/migrate-projects.mjs and by the app on first open, so the last line starts Next.js
// only. Every other line is compared with test/fixtures/Dockerfile.before, a copy of the
// Dockerfile from when the image still pushed the schema. DEPLOY.md is read too: its startup
// and backup paragraphs must keep the sentences checked below.

const NEW_CMD = 'CMD ["npx", "next", "start", "-p", "3000"]';

const lines = (path: string) => readFileSync(path, "utf8").replace(/\n+$/, "").split("\n");

describe("the Dockerfile migrates instead of pushing (T59)", () => {
  it("T59 the last line is exactly the start command (no schema step in the image)", () => {
    expect(lines("Dockerfile").at(-1)).toBe(NEW_CMD);
  });

  it("T59 the file contains neither db push nor accept-data-loss", () => {
    const text = readFileSync("Dockerfile", "utf8");
    expect(text).not.toMatch(/db push/);
    expect(text).not.toMatch(/accept-data-loss/);
  });

  it("T59 every other line is the line of the Dockerfile before the change", () => {
    const before = lines("test/fixtures/Dockerfile.before");
    const after = lines("Dockerfile");
    // the fixture really is the old file: its last line is the schema push
    expect(before.at(-1)).toBe('CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npx next start -p 3000"]');
    // the lines above the command are the old ones, plus the comment saying why there is no schema step
    const code = (ls: string[]) => ls.slice(0, -1).filter((l) => !l.startsWith("#"));
    expect(code(after)).toEqual(code(before));
  });
});

describe("DEPLOY.md says what the container runs, and how to get back (T59, D25)", () => {
  const deploy = () => readFileSync("DEPLOY.md", "utf8");

  it("T59 the startup text says each project database is migrated (migrate-projects.mjs), and the old `prisma db push` line is gone", () => {
    expect(deploy()).toContain("runs `prisma migrate deploy` in every project database at start");
    expect(deploy()).toContain("scripts/migrate-projects.mjs");
    expect(deploy()).not.toContain("The container runs `prisma db push` on startup");
  });

  it("T59 D25 a backup step: before deploying 20260925150000_two_level_forms, pg_dump --schema=qualification", () => {
    const text = deploy();
    const step = text
      .split("\n")
      .filter((l) => l.includes("20260925150000_two_level_forms"));
    expect(step.length).toBeGreaterThan(0);
    // the step names the migration and the dump of the schema, in one paragraph
    const paragraph = text
      .split(/\n\s*\n/)
      .find((p) => p.includes("20260925150000_two_level_forms"))!;
    expect(paragraph).toMatch(/before deploying/i);
    expect(paragraph).toMatch(/pg_dump[^\n]*--schema=qualification/);
  });

  it("T59 a database made by db push has no migration history: baseline it with prisma migrate resolve --applied", () => {
    const paragraph = deploy()
      .split(/\n\s*\n/)
      .find((p) => p.includes("prisma migrate resolve --applied"));
    expect(paragraph).toBeDefined();
    expect(paragraph).toMatch(/db push/);
    expect(paragraph).toMatch(/no migration history/i);
    expect(paragraph).toMatch(/every migration/i);
    expect(paragraph).toMatch(/before the first start/i);
  });
});
