import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

// Every npm script that runs a file of this app names one that exists.
describe("the npm scripts", () => {
  const scripts: Record<string, string> = JSON.parse(
    readFileSync("package.json", "utf8"),
  ).scripts;

  it("name files that exist", () => {
    const missing = Object.entries(scripts).flatMap(([name, cmd]) =>
      [...cmd.matchAll(/\bnode\s+(\S+\.m?js)\b/g)]
        .map((m) => m[1])
        .filter((f) => !existsSync(f))
        .map((f) => `${name}: ${f}`),
    );
    expect(missing).toEqual([]);
  });
});
