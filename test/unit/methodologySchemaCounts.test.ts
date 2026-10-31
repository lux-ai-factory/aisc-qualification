import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// The methodology page states how much of AIRO the graph builder implements. The
// numbers are the builder's own, services/ontology/airo_min/schema.py, so the page is
// read against that file here: a class or property added there fails this test until
// the page says so.

/** The keys of one `NAME: dict[...] = { ... }` block of schema.py. */
function keysOf(source: string, name: string): string[] {
  const block = source.match(new RegExp(`^${name}: [^\\n]*= \\{\\n([\\s\\S]*?)^\\}`, "m"));
  if (!block) throw new Error(`no ${name} block in schema.py`);
  return [...block[1].matchAll(/^ {4}"(\w+)":/gm)].map((m) => m[1]);
}

describe("the methodology page's AIRO subset", () => {
  it("counts the classes and properties schema.py holds", () => {
    const schema = readFileSync("services/ontology/airo_min/schema.py", "utf8");
    const page = readFileSync("src/app/methodology/page.tsx", "utf8");
    const stated = page.match(/schema: \{ classes: (\d+), properties: (\d+) \}/);
    expect(stated).not.toBeNull();
    expect(Number(stated![1])).toBe(keysOf(schema, "CLASSES").length);
    expect(Number(stated![2])).toBe(keysOf(schema, "PROPERTIES").length);
  });
});
