import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// The pages loaded Inter from Google Fonts, so every page view told Google who was reading an AI
// card, and the app needed the internet to look right (code review B8, 2026-10-05). The font now
// ships with the app (@fontsource/inter), under the same family name.
const layout = readFileSync("src/app/layout.tsx", "utf8");

describe("the font ships with the app", () => {
  it("the layout names no Google Fonts host", () => {
    expect(layout).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
  });

  it("it imports Inter's weights from @fontsource/inter", () => {
    for (const w of [400, 500, 600, 700, 800, 900]) {
      expect(layout).toContain(`import "@fontsource/inter/${w}.css";`);
    }
  });

  it("the package declares the family the stylesheet asks for", () => {
    const css = readFileSync("node_modules/@fontsource/inter/400.css", "utf8");
    expect(css).toMatch(/font-family:\s*'Inter'/);
    expect(readFileSync("src/app/globals.css", "utf8")).toMatch(
      /font-family:\s*\n?\s*"?Inter/,
    );
  });
});
