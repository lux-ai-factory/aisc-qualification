import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// The AISC brand theme (Luxembourg AI Factory). The canonical values live in
// the root repo's shared/theme/brand.json; this submodule is built on its own (Docker), so the
// values the app uses are copied here and the root's scripts/tests/test_brand_theme.py checks
// that both agree.
const BRAND: Record<string, string> = {
  "--bg": "#f2f3fd",
  "--panel": "#ffffff",
  "--panel-2": "#f2f3fd",
  "--text": "#0b0b2e",
  "--muted": "#4a4f6a",
  "--faint": "#6b7090",
  "--primary": "#000fdf",
  "--primary-hover": "#000079",
  "--accent": "#ff007e",
  "--accent-hover": "#cc0066",
  "--info": "#0099ff",
  "--info-soft": "#ccebff",
  "--pink-soft": "#ffcce5",
  "--border": "#cccff9",
  "--border-strong": "#999ff2",
  "--error": "#e30613",
  "--heading": "#000079",
};

const css = readFileSync("src/app/globals.css", "utf8");
const root = css.match(/:root\s*\{([\s\S]*?)\n\}/)![1];
const rule = (selector: string) =>
  css.match(new RegExp(`(?:^|\\n)${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";

describe("the brand theme", () => {
  it.each(Object.entries(BRAND))(":root sets %s to %s", (name, value) => {
    expect(root).toMatch(new RegExp(`\\n\\s*${name}:\\s*${value};`));
  });

  it("headings are MuseoModerno in the heading colour", () => {
    const h = rule("h1,\\s*h2,\\s*h3,\\s*h4");
    expect(h).toMatch(/font-family:\s*var\(--font-heading\)/);
    expect(h).toMatch(/color:\s*var\(--heading\)/);
  });

  it("body text is Raleway", () => {
    expect(root).toMatch(/\n\s*font-family:\s*var\(--font-body\)/);
  });

  it("ids and code are IBM Plex Mono", () => {
    expect(rule("code,\\s*kbd,\\s*pre,\\s*samp")).toMatch(
      /font-family:\s*var\(--font-mono\)/,
    );
  });

  // shared/theme/brand.json "header": the same header in every app.
  it("the site header is 89px: 20px 40px padding, a 1px border, the logo 48px", () => {
    expect(root).toMatch(/\n\s*--site-header-h:\s*89px;/);
    expect(rule("\\.site-header")).toMatch(/border-bottom:\s*1px solid var\(--border\);/);
    expect(rule("\\.site-header \\.inner")).toMatch(/padding:\s*20px 40px;/);
    expect(rule("\\.site-header \\.brand img")).toMatch(/height:\s*48px;/);
  });

  it("the product title is 19px MuseoModerno 700, not uppercased or spaced", () => {
    const brand = rule("\\.site-header \\.brand");
    expect(brand).toMatch(/font-family:\s*var\(--font-heading\);/);
    expect(brand).toMatch(/font-size:\s*19px;/);
    expect(brand).toMatch(/font-weight:\s*700;/);
    expect(brand).not.toMatch(/letter-spacing/);
    expect(brand).not.toMatch(/text-transform:\s*(?!none)/);
  });

  it("no page or panel white is hard-coded outside :root", () => {
    const outside = css.replace(/:root\s*\{[\s\S]*?\n\}/, "");
    expect(outside).not.toMatch(/background:\s*#fff(fff)?\s*;/i);
  });
});
