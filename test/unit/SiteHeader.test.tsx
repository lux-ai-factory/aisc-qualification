// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import SiteHeader from "@/components/SiteHeader";

// Addendum 06, R49: a "Forms" link in the site header, inside a project only. Two-level
// forms T60 (D24): "Question sets" and "Questionnaires" take its place.

let before: string | undefined;
beforeEach(() => {
  before = process.env.LAUNCHER_URL;
  process.env.LAUNCHER_URL = "http://launcher.test/";
});
afterEach(() => {
  cleanup();
  if (before === undefined) delete process.env.LAUNCHER_URL;
  else process.env.LAUNCHER_URL = before;
});

const navLinks = (container: HTMLElement) =>
  [...container.querySelectorAll("nav a")].map((a) => [a.textContent, a.getAttribute("href")]);

describe("the site header (R49, T60)", () => {
  it('T60 inside a project the nav is "← Back", "AI system", "Versions", "Question sets", "Questionnaires", "Methodology"', () => {
    const { container } = render(<SiteHeader project="demo" />);
    expect(navLinks(container).map(([text]) => text)).toEqual([
      "← Back", "AI system", "Versions", "Question sets", "Questionnaires", "Methodology",
    ]);
    expect(navLinks(container).find(([text]) => text === "Question sets")![1]).toBe("/p/demo/question-sets");
    expect(navLinks(container).find(([text]) => text === "Questionnaires")![1]).toBe("/p/demo/questionnaires");
    expect(navLinks(container).map(([text]) => text)).not.toContain("Forms");
  });

  it("T60 without a project there is neither link", () => {
    const { container } = render(<SiteHeader />);
    const texts = navLinks(container).map(([text]) => text);
    expect(texts).not.toContain("Question sets");
    expect(texts).not.toContain("Questionnaires");
    expect(texts).not.toContain("Forms");
    expect(texts).toEqual(["Methodology"]);
  });
});
