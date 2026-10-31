import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// The DB tests' throwaway Postgres (test/db/throwaway-db.sh) runs the major version the stack
// runs, so a migration that works only on a newer Postgres fails here first. The stack's image
// is read from the root checkout when there is one; this app's own CI runs without it, and then
// the pinned image is the one the stack had when this was written.

const APP = resolve(__dirname, "../..");
const STACK_COMPOSE = resolve(APP, "../../docker-compose-infra.development.yml");
const PINNED = "postgres:15-alpine";

const bedImage = () => {
  const found = readFileSync(resolve(APP, "test/db/throwaway-db.sh"), "utf8").match(/^\s*(postgres:\S+)\s*>/m);
  return found?.[1];
};

describe("the DB tests' throwaway Postgres", () => {
  it("runs the image the stack runs", () => {
    const stack = existsSync(STACK_COMPOSE)
      ? readFileSync(STACK_COMPOSE, "utf8").match(/image:\s*(postgres:\S+)/)?.[1]
      : PINNED;
    expect(stack).toBeDefined();
    expect(bedImage()).toBe(stack);
  });
});
