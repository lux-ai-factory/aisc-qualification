import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// Prisma records each migration's sha256 in _prisma_migrations when it applies it, so an
// applied migration keeps its bytes: comments included. Each one deployed databases have
// applied is pinned here; any edit to its text, even a comment, fails. A change to the schema
// is a new migration. What the forms migrations do to a real database is
// test/db/twoLevelForms.db.test.ts.

describe("the migrations applied on deployed databases are not edited", () => {
  it("every applied migration still carries the bytes deployed databases recorded", () => {
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

// sha256 of the applied migrations, as deployed databases recorded them.
const APPLIED_HASHES: Record<string, string> = {
  "prisma/migrations/20260925000000_project_database/migration.sql":
    "ea1a1ba6163ed16ff5032618430c4ba4acd9a7f745b4836810d1ac894e7a8934",
  "prisma/migrations/20260925090000_forms_are_data/migration.sql":
    "cbea212d7cd330c13c667918bad2b57572a2ceb871c327da423a3bb687147557",
  "prisma/migrations/20260925120000_the_default_form_is_fixed/migration.sql":
    "b8338d12f1c9f3c92022798556e1d0ef7a5b1f25b60b6e7b141feac2ca8dfb4c",
  "prisma/migrations/20260925150000_two_level_forms/migration.sql":
    "6397ff74fa1c8699b4ef69fa54b81fc78c8ee2e2ef4643071f454cda9f69dc84",
  "prisma/migrations/20260927000000_readers_read_the_forms/migration.sql":
    "f99684042877920ae2b7be908f010b4cb430c057f13200d89bb1fc6b6c2b39b1",
  "prisma/migrations/20260929000000_system_components/migration.sql":
    "ad40bc11d37e34d530126702bf3ea6ffa63852da6f5062a6528fe4fd50f19452",
  "prisma/migrations/20260930000000_vair_terms/migration.sql":
    "e5d7f557e9d7cdf80707ad6a62423586b25f2ef59499623c4432d9eb4f8daced",
  "prisma/migrations/20261001000000_people_terms/migration.sql":
    "1221bdec11b346b406a36e7e2e9bb51049e0899c0a27559e46dd0042ed04875e",
  "prisma/migrations/20261003000000_ledger_history/migration.sql":
    "e482a0df348bf656b0d1b40e4cc266d7a1d1250414730b6fc156882c3e080a45",
  "prisma/migrations/20261018000000_review_carried/migration.sql":
    "c39bf8bdc2cf8782d96bdb100ccd8c68ba32909ad0b5870ae9c0aa363e2893f9",
};
