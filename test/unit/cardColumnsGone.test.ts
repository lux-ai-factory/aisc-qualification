import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// The card is the filled AIRO graph (ontologyExtracted + ontologyPatch). The old columns that
// held a rendered card (systemCard, systemCardJson, system_card_at, systemCardPdfPath) were
// never read: the schema no longer has them and a migration drops them where they still exist.

const OLD = ["systemCard", "systemCardJson", "systemCardAt", "systemCardPdfPath"];
const COLUMNS = ['"systemCard"', '"systemCardJson"', "system_card_at", '"systemCardPdfPath"'];
const MIGRATIONS = "prisma/migrations";

function qualificationModel(): string {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const m = /^model Qualification \{\n([\s\S]*?)^\}/m.exec(schema);
  if (!m) throw new Error("model Qualification not found");
  return m[1];
}

describe("the qualification table has no rendered-card columns", () => {
  it("model Qualification declares none of them", () => {
    const names = qualificationModel()
      .split("\n")
      .map((l) => /^\s*(\w+)\s/.exec(l.replace(/\/\/.*$/, ""))?.[1])
      .filter(Boolean);
    for (const name of OLD) expect(names).not.toContain(name);
  });

  it("a migration after the baseline drops each of them IF EXISTS", () => {
    const dirs = readdirSync(MIGRATIONS)
      .filter((d) => /^\d{14}_/.test(d) && d !== "20260925000000_project_database")
      .sort();
    const sql = dirs
      .map((d) => readFileSync(join(MIGRATIONS, d, "migration.sql"), "utf8"))
      .join("\n");
    for (const col of COLUMNS)
      expect(sql).toMatch(
        new RegExp(`DROP COLUMN IF EXISTS ${col.replace(/"/g, '\\"')}`),
      );
  });
});
