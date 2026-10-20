import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// The forms migrations are applied on deployed databases and Prisma refuses a changed
// checksum, so each one is pinned by its sha256: any edit to its text fails here. What they
// do to a real database is test/db/twoLevelForms.db.test.ts.

describe("the migrations applied on live are not edited", () => {
  it("20260925090000, 20260925120000 and 20260925150000 still carry the bytes deployed databases recorded", () => {
    const SHA: Record<string, string> = {};
    for (const file of Object.keys(APPLIED_HASHES)) {
      const bytes = readFileSync(file);
      SHA[file] = createHash("sha256").update(bytes).digest("hex");
      expect(bytes.length).toBeGreaterThan(0);
    }
    // the files' hashes as they were applied:
    expect(SHA).toEqual(APPLIED_HASHES);
  });
});

// sha256 of the applied forms migrations, as deployed databases recorded them.
const APPLIED_HASHES: Record<string, string> = {
  "prisma/migrations/20260925090000_forms_are_data/migration.sql":
    "cbea212d7cd330c13c667918bad2b57572a2ceb871c327da423a3bb687147557",
  "prisma/migrations/20260925120000_the_default_form_is_fixed/migration.sql":
    "b8338d12f1c9f3c92022798556e1d0ef7a5b1f25b60b6e7b141feac2ca8dfb4c",
  "prisma/migrations/20260925150000_two_level_forms/migration.sql":
    "6397ff74fa1c8699b4ef69fa54b81fc78c8ee2e2ef4643071f454cda9f69dc84",
};
