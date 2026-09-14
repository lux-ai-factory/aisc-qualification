// @vitest-environment jsdom
// A compiled qualification runs nearly edge to edge, and that width lives in
// CSS where no component test can see it. It has already regressed once: the
// old rule was scoped to a direct child of .qualify-page and stopped applying
// the moment the card moved into a tab panel. These are guards on the two
// halves of that arrangement, the class the page asks for and the rule that
// answers it, so the two cannot drift apart again.
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");
const detailPage = readFileSync("src/app/qualify/[id]/page.tsx", "utf8");

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
    // Wider than the 820px reading column, because the metadata fields pair up
    // and the answers are paragraphs; well short of the compiled card's
    // near-full-bleed, because a row of inputs 1900px wide is not a form.
    const page = readFileSync("src/app/qualify/new/page.tsx", "utf8");
    expect(page).toMatch(/className="qualify-page qualify-page--form"/);
    expect(page).not.toMatch(/qualify-page--wide/);
    expect(rule(".qualify-page--form")).toMatch(/max-width: 1080px/);
    // and the default column is unchanged for everything else
    expect(rule(".qualify-page")).toMatch(/max-width: 820px/);
  });
});
