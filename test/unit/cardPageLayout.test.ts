import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The card page: Let AI suggest additions sits in the AI card tab only, and there is no
// engine-link panel. The card's parts are its own Components rows; the engine
// is not asked about them here.
const page = readFileSync(
  join(
    __dirname,
    "..",
    "..",
    "src",
    "app",
    "p",
    "[project]",
    "qualify",
    "[id]",
    "page.tsx",
  ),
  "utf8",
);

describe("the card page", () => {
  it("puts Let AI suggest additions inside the AI card tab and nowhere else", () => {
    const card = page.slice(page.indexOf("card={"));
    expect(card).toContain("<FillStatus");
    expect(page.slice(0, page.indexOf("card={"))).not.toContain("<FillStatus");
  });

  it("lists Versions once, in the menu, and leaves AI system out of it: the page is the system", () => {
    expect(page).not.toContain("href={`/p/${project}/qualifications`}");
    expect(page).toMatch(/<ProjectNav\s+project=\{project\}\s+withSystem=\{false\}/);
  });

  it("says in the AI card part what this version took from the review of the one before", () => {
    const card = page.slice(page.indexOf("card={"));
    expect(card).toContain("<CarriedNotice");
    expect(page).toMatch(/qualificationService\s*\.carriedReview\(project, q\.id\)/);
  });

  it("heads the card with its AI card version and the system's release, and offers to update the answers", () => {
    expect(page).toContain("AI card v{standing.versionNumber}");
    expect(page).toContain("releaseLabel(q.systemVersion)");
    expect(page).toContain("updateAnswersLabel(standing.versionNumber)");
    expect(page).not.toContain("Edit the AI system");
    expect(page).not.toContain("knowledge graph");
  });

  it("counts the places to check on the card it built, not on the agent's last run", () => {
    expect(page).toContain(
      "places={ontology ? placesToCheck(ontology.view) : 0}",
    );
  });
});
