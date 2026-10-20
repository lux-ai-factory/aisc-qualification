import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// The image never pushes the schema with `db push --accept-data-loss`, which would drop the
// form tables' data without a migration. Each project database is migrated by
// scripts/migrate-projects.mjs and by the app on first open, so the last line starts Next.js
// only.

const NEW_CMD = 'CMD ["npx", "next", "start", "-p", "3000"]';

const lines = (path: string) =>
  readFileSync(path, "utf8").replace(/\n+$/, "").split("\n");

describe("the Dockerfile migrates instead of pushing", () => {
  it("the last line is exactly the start command (no schema step in the image)", () => {
    expect(lines("Dockerfile").at(-1)).toBe(NEW_CMD);
  });

  it("the file contains neither db push nor accept-data-loss", () => {
    const text = readFileSync("Dockerfile", "utf8");
    expect(text).not.toMatch(/db push/);
    expect(text).not.toMatch(/accept-data-loss/);
  });
});
