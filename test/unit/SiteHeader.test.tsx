// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import SiteHeader from "@/components/SiteHeader";

// The site header, inside a project only: "Question sets", "Questionnaires" and
// "Methodology" sit in one "Framework" menu, what a qualification is measured by.

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

// The links directly in the bar, and the menu's own label, in the order they read.
const barItems = (container: HTMLElement) =>
  [...container.querySelectorAll("nav > a, nav > details > summary")].map((el) => el.textContent);

const menu = (container: HTMLElement) => container.querySelector("nav details") as HTMLDetailsElement;

describe("the site header (R49, T60)", () => {
  it('inside a project the bar reads "← Back", "AI system", "Versions", "Framework"', () => {
    const { container } = render(<SiteHeader project="demo" />);
    expect(barItems(container)).toEqual(["← Back", "AI system", "Versions", "Framework"]);
  });

  it("the Framework menu holds Question sets, Questionnaires and Methodology, inside the project", () => {
    const { container } = render(<SiteHeader project="demo" />);
    const items = [...menu(container).querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")]);
    expect(items).toEqual([
      ["Question sets", "/p/demo/question-sets"],
      ["Questionnaires", "/p/demo/questionnaires"],
      ["Methodology", "/methodology"],
    ]);
    expect(navLinks(container).map(([text]) => text)).not.toContain("Forms");
  });

  it("the menu starts closed, and picking an item closes it", () => {
    const { container, getByText } = render(<SiteHeader project="demo" />);
    expect(menu(container).open).toBe(false);
    menu(container).open = true;
    fireEvent.click(getByText("Questionnaires"));
    expect(menu(container).open).toBe(false);
  });

  it("Escape and a click outside close the menu", () => {
    const { container } = render(<SiteHeader project="demo" />);
    menu(container).open = true;
    fireEvent.keyDown(document, { key: "Escape" });
    expect(menu(container).open).toBe(false);
    menu(container).open = true;
    fireEvent.mouseDown(document.body);
    expect(menu(container).open).toBe(false);
  });

  it("a click inside the menu leaves it open", () => {
    const { container } = render(<SiteHeader project="demo" />);
    menu(container).open = true;
    fireEvent.mouseDown(menu(container).querySelector("summary")!);
    expect(menu(container).open).toBe(true);
  });

  it("T60 without a project there is no menu, only Methodology", () => {
    const { container } = render(<SiteHeader />);
    expect(menu(container)).toBeNull();
    expect(navLinks(container)).toEqual([["Methodology", "/methodology"]]);
  });
});
