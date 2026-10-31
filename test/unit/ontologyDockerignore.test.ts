import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

// The ontology image is built with apps/qualification as its context (docker-compose:
// `context: apps/qualification`, `dockerfile: services/ontology/Dockerfile`). Docker reads
// a .dockerignore only at the context root, or one named after the Dockerfile beside it,
// which then replaces the root one for that build. So the ontology's own list sits in
// services/ontology/Dockerfile.dockerignore, with paths from the context root, and keeps
// what the root list keeps out as well.

const FILE = "services/ontology/Dockerfile.dockerignore";

const entries = () =>
  readFileSync(FILE, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

describe("the ontology image's ignore list", () => {
  it("is named after its Dockerfile, the only name Docker reads beside it", () => {
    expect(existsSync(FILE)).toBe(true);
    expect(existsSync("services/ontology/.dockerignore")).toBe(false);
  });

  it("keeps the ontology's tests out, by their path from the context root", () => {
    expect(entries()).toContain("services/ontology/tests");
  });

  it("keeps out everything the root list keeps out", () => {
    const root = readFileSync(".dockerignore", "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    for (const entry of root) expect(entries()).toContain(entry);
  });
});
