import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Next 15.0.3 let a header skip the middleware (CVE-2025-29927, fixed in 15.2.3) and a crafted server
// action run code (CVE-2025-55182 / CVE-2025-66478, fixed in 15.5.7), found 2026-10-05. The installed
// versions, not only the ranges, so a lockfile pinning an old one fails too.
const installed = (name: string) =>
  JSON.parse(
    readFileSync(
      join(process.cwd(), "node_modules", name, "package.json"),
      "utf8",
    ),
  ).version as string;
const parts = (v: string) => v.split(/[.-]/).slice(0, 3).map(Number);
const atLeast = (v: string, min: string) => {
  const [a, b] = [parts(v), parts(min)];
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
};

describe("Next and React carry the 2025 security fixes", () => {
  it("next is 15.5.7 or later", () => {
    expect(atLeast(installed("next"), "15.5.7"), installed("next")).toBe(true);
  });
  it("react and react-dom are a stable 19 release, not the 2024 release candidate", () => {
    for (const name of ["react", "react-dom"]) {
      expect(installed(name), name).toMatch(/^19\.\d+\.\d+$/);
    }
  });
});
