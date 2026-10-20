import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

// The pages loaded Inter from Google Fonts, so every page view told Google who was reading an AI
// card, and the app needed the internet to look right. The fonts
// ship with the app. They are the brand theme's three families:
// MuseoModerno for headings, Raleway for body text, IBM Plex Mono for ids and code.
const layout = readFileSync("src/app/layout.tsx", "utf8");
const css = readFileSync("src/app/globals.css", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

describe("the fonts ship with the app", () => {
  it("the layout names no Google Fonts host", () => {
    expect(layout).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
  });

  it("it imports the brand families from @fontsource", () => {
    expect(layout).toContain('import "@fontsource-variable/museomoderno";');
    expect(layout).toContain('import "@fontsource-variable/raleway";');
    for (const w of [400, 500, 600]) {
      expect(layout).toContain(`import "@fontsource/ibm-plex-mono/${w}.css";`);
    }
  });

  it("Inter is gone from the layout, the stylesheet and the package", () => {
    expect(layout).not.toMatch(/inter/i);
    expect(css).not.toMatch(/\bInter\b/);
    expect(pkg.dependencies["@fontsource/inter"]).toBeUndefined();
    expect(existsSync("node_modules/@fontsource/inter")).toBe(false);
  });

  it("the packages declare the families the stylesheet asks for", () => {
    const families: [string, RegExp][] = [
      [
        "node_modules/@fontsource-variable/museomoderno/index.css",
        /font-family:\s*'MuseoModerno Variable'/,
      ],
      [
        "node_modules/@fontsource-variable/raleway/index.css",
        /font-family:\s*'Raleway Variable'/,
      ],
      [
        "node_modules/@fontsource/ibm-plex-mono/400.css",
        /font-family:\s*'IBM Plex Mono'/,
      ],
    ];
    for (const [file, family] of families) {
      expect(readFileSync(file, "utf8")).toMatch(family);
    }
    expect(css).toMatch(/--font-body:\s*"Raleway Variable"/);
    expect(css).toMatch(/--font-heading:\s*"MuseoModerno Variable"/);
    expect(css).toMatch(/--font-mono:\s*"IBM Plex Mono"/);
  });
});
