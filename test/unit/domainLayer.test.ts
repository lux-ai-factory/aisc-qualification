import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// src/domain is the app's pure core: the server layer builds on it, never the other way
// round, so a domain module can be used anywhere (a client component included) without
// pulling in server code.

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sources(path);
    return /\.tsx?$/.test(e.name) ? [path] : [];
  });
}

describe("the domain layer", () => {
  it("imports nothing from the server layer", () => {
    const offenders = sources("src/domain").filter((path) =>
      /from\s+["'](@\/server\/|(\.\.\/)+server\/)/.test(readFileSync(path, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
