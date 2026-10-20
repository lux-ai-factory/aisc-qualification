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
    expect(detailPage).toMatch(/className="qualify-page qualify-page--wide[ "]/);
    expect(rule(".qualify-page--wide")).toMatch(/max-width: min\(1900px,/);
    // Scoped to the page, so any nesting the tabs introduce still gets it.
    expect(css).not.toMatch(/\.qualify-page\s*>\s*\.onto\b/);
  });

  it("lays the card page out as a left menu beside its panel, and moves the header's links into the menu", () => {
    // the menu is fixed against the left edge, from under the header to the bottom of the window, so
    // scrolling never moves it; the page content starts after its column
    expect(rule(".qf-sidemenu")).toMatch(/position: fixed/);
    expect(rule(".qf-sidemenu")).toMatch(/left: 0;/);
    expect(rule(".qf-sidemenu")).toMatch(/top: var\(--site-header-h\)/);
    expect(rule(".qf-sidemenu")).toMatch(/bottom: 0;/);
    expect(rule(".qf-sidemenu")).toMatch(/width: var\(--side-menu-w\)/);
    expect(rule(".qualify-page--menu")).toMatch(/margin-left: var\(--side-menu-w\)/);
    expect(rule(".qf-sidemenu-site")).toMatch(/margin-top: auto/);
    // the card's title is inside the panel, so the menu starts right under the header
    expect(detailPage).toMatch(/header=\{/);
    expect(detailPage).not.toMatch(
      /<header className="qualify-header">\s*<div className="qf-header-row">[\s\S]*<QualificationMenu/,
    );
    // the header's own links give way to the copy at the bottom of the menu
    expect(rule("body:has(.qf-sidemenu) .site-header .site-nav")).toMatch(
      /display: none/,
    );
  });

  it("gives the canvas its height from the same place", () => {
    expect(rule(".qualify-page--wide .onto-canvas")).toMatch(
      /height: min\(78vh, 940px\)/,
    );
  });

  it("still applies to an .onto section nested inside the menu's panel", () => {
    document.body.innerHTML = `
      <main class="qualify-page qualify-page--wide">
        <div class="qf-sidepanel">
          <section class="qf-section onto"><div class="onto-canvas" id="c"></div></section>
        </div>
      </main>`;
    expect(
      document.getElementById("c")!.matches(".qualify-page--wide .onto-canvas"),
    ).toBe(true);
  });

  it("gives the form being filled in its own, middling width", () => {
    // Wider than the 820px reading column, because the metadata fields pair up,
    // the answers are paragraphs and a risk's selects sit beside them (1440px);
    // short of the compiled card's 1900px near-full-bleed.
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

  it("gives the questionnaire builder the card's wide page, the same way", () => {
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
