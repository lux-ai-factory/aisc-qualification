import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The document prefill. The upload lives on the system's edit page (/qualify/new
// is a redirect), proposes the 21 mapped fields and the risk rows, and never sets tags.
//
// The prefill modules are loaded at run time so this file does not depend on them
// at collection.

const load = (path: string): Promise<any> =>
  import(/* @vite-ignore */ resolve("src", path));

describe("the shared prefill field list", () => {
  it("the prefill field list shared with the service has the same 21 fields", () => {
    const shared = JSON.parse(
      readFileSync("src/data/prefillFields.json", "utf8"),
    );
    // annex: point -> letter -> form field; two letters may share one field
    const annex = new Set(
      Object.values(
        shared.annex as Record<string, Record<string, string>>,
      ).flatMap((group) => Object.values(group)),
    );
    expect(shared.metadata.length + annex.size).toBe(21);
  });
});

describe("tags are chosen, never uploaded", () => {
  it("no tag picker is prefillable", async () => {
    const { PREFILLABLE } = await load("lib/prefillChoice.ts");
    for (const tags of [
      "targetSystemTags",
      "sectorTags",
      "marketFormTags",
      "localityTags",
    ]) {
      expect(PREFILLABLE.has(tags)).toBe(false);
    }
  });
});
