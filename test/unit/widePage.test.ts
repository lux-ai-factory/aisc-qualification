// @vitest-environment jsdom
// A compiled qualification runs nearly edge to edge, and that width lives in
// CSS where no component test can see it. A rule scoped to a direct child of
// .qualify-page stops applying once the card sits in a tab panel. These are
// guards on the two halves of that arrangement, the class the page asks for and
// the rule that answers it, so the two cannot drift apart.
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");
const detailPage = readFileSync(
  "src/app/p/[project]/qualify/[id]/page.tsx",
  "utf8",
);

/** The declarations of one rule, by selector. */
function rule(selector: string): string {
  const at = css.indexOf(selector + " {");
  expect(at, `${selector} must exist`).toBeGreaterThan(-1);
  return css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
}

describe("a compiled qualification uses the window's width", () => {
  it("is the page that is wide, not one section inside it", () => {
    expect(detailPage).toMatch(/className="qualify-page qualify-page--wide"/);
    expect(rule(".qualify-page--wide")).toMatch(/max-width: min\(1900px,/);
    // Scoped to the page, so any nesting the tabs introduce still gets it.
    expect(css).not.toMatch(/\.qualify-page\s*>\s*\.onto\b/);
  });

  it("gives the canvas its height from the same place", () => {
    expect(rule(".qualify-page--wide .onto-canvas")).toMatch(
      /height: min\(78vh, 940px\)/,
    );
  });

  it("still applies to an .onto section nested inside the tab panel", () => {
    document.body.innerHTML = `
      <main class="qualify-page qualify-page--wide">
        <div class="qf-tabpanel">
          <section class="qf-section onto"><div class="onto-canvas" id="c"></div></section>
        </div>
      </main>`;
    expect(
      document.getElementById("c")!.matches(".qualify-page--wide .onto-canvas"),
    ).toBe(true);
  });

  it("gives the form being filled in its own, middling width", () => {
    // Wider than the 820px reading column, because the metadata fields pair up,
    // the answers are paragraphs and a risk's selects sit beside them (2026-10-07:
    // 1440px, was 1080px); short of the compiled card's 1900px near-full-bleed.
    const page = readFileSync(
      "src/app/p/[project]/system/edit/page.tsx",
      "utf8",
    );
    expect(page).toMatch(/className="qualify-page qualify-page--fill"/);
    expect(page).not.toMatch(/qualify-page--wide/);
    expect(rule(".qualify-page--fill")).toMatch(
      /max-width: min\(1440px, calc\(100vw - 56px\)\)/,
    );
    // the other --form pages keep 1080px
    expect(rule(".qualify-page--form")).toMatch(/max-width: 1080px/);
    // and the default column is unchanged for everything else
    expect(rule(".qualify-page")).toMatch(/max-width: 820px/);
  });

  it("gives the questionnaire builder the card's wide page, the same way (addendum 06 R74, two-level forms T32)", () => {
    // The builder is two columns of long questions: it takes the same class
    // as the compiled card, not a rule of its own. The questionnaires list and
    // every question-set page stay 1080px.
    for (const path of [
      "src/app/p/[project]/questionnaires/new/page.tsx",
      "src/app/p/[project]/questionnaires/[questionnaireId]/edit/page.tsx",
    ]) {
      expect(readFileSync(path, "utf8"), path).toMatch(
        /className="qualify-page qualify-page--wide qf-forms-page"/,
      );
    }
    const importStep = readFileSync(
      "src/app/p/[project]/questionnaires/import/QuestionnaireImport.tsx",
      "utf8",
    );
    expect(importStep).toContain(
      '"qualify-page qualify-page--wide qf-forms-page"',
    );
    const library = readFileSync(
      "src/app/p/[project]/questionnaires/page.tsx",
      "utf8",
    );
    expect(library).toMatch(
      /className="qualify-page qualify-page--form qf-forms-page"/,
    );
    expect(library).not.toMatch(/qualify-page--wide/);
    const sets = readFileSync(
      "src/app/p/[project]/question-sets/page.tsx",
      "utf8",
    );
    expect(sets).toMatch(
      /className="qualify-page qualify-page--form qf-forms-page"/,
    );
    expect(sets).not.toMatch(/qualify-page--wide/);
    const setImport = readFileSync(
      "src/app/p/[project]/question-sets/import/QuestionSetImport.tsx",
      "utf8",
    );
    expect(setImport).not.toMatch(/qualify-page--wide/);
  });
});
