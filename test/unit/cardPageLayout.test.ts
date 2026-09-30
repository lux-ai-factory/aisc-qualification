import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The card page (2026-09-30): Refine with AI sits in the AI card tab only, and
// the engine-link panel is gone. The card's parts are its own Components rows;
// the engine is not asked about them here.
const page = readFileSync(
  join(__dirname, "..", "..", "src", "app", "p", "[project]", "qualify", "[id]", "page.tsx"),
  "utf8",
);

describe("the card page", () => {
  it("puts Refine with AI inside the AI card tab and nowhere else", () => {
    const card = page.slice(page.indexOf("card={"));
    expect(card).toContain("<FillStatus");
    expect(page.slice(0, page.indexOf("card={"))).not.toContain("<FillStatus");
  });

  it("counts the places to check on the card it built, not on the agent's last run", () => {
    expect(page).toContain("places={ontology ? placesToCheck(ontology.view) : 0}");
  });

  it("no longer shows the engine-link panel or asks the engine", () => {
    expect(page).not.toContain("ComponentsPanel");
    expect(page).not.toContain("engineClient");
  });
});
