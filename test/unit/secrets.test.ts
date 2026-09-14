import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const PATTERNS: [string, RegExp][] = [
  ["Anthropic key", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["OpenAI key", /sk-[A-Za-z0-9]{32,}/],
  ["AWS key id", /AKIA[0-9A-Z]{16}/],
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  [
    "inline credential",
    /(api[_-]?key|secret|token|password)["']?\s*[:=]\s*["'][A-Za-z0-9/+=_-]{16,}["']/i,
  ],
  // An env line carries its value unquoted, which the pattern above misses, and
  // an env file is the likeliest place for a real key to be left behind.
  [
    "env credential",
    /^[A-Z0-9_]*(API_KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*=(?!["']?(your|changeme|placeholder|example|dev-|test-|<))[A-Za-z0-9/+=_-]{16,}$/m,
  ],
];

const SKIP = /\.(ttl|jsonld|pdf|svg|png|jpg|ico|lock)$|package-lock\.json$/;

function trackedFiles(): string[] {
  // Everything git would publish: the index, plus files not yet added that are
  // not ignored. A guard over the index alone says nothing about the work about
  // to be committed, which is where a key would actually arrive.
  return execSync("git ls-files -co --exclude-standard", { encoding: "utf8" })
    .split("\n")
    .filter((f) => f && !SKIP.test(f) && existsSync(f));
}

describe("nothing committed carries a credential", () => {
  it("holds for every file git would publish", () => {
    const found: string[] = [];
    for (const file of trackedFiles()) {
      if (statSync(file).size > 512_000) continue;
      const text = readFileSync(file, "utf8");
      for (const [name, pattern] of PATTERNS) {
        if (pattern.test(text)) found.push(`${file}: ${name}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("keeps .env out of the repository", () => {
    expect(trackedFiles()).not.toContain(".env");
  });

  it("leaves the example env without real values", () => {
    const example = readFileSync(".env.example", "utf8");
    expect(example).not.toMatch(/=\s*"?[A-Za-z0-9]{20,}/);
  });
});
