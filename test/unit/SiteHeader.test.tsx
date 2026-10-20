// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import SiteHeader from "@/components/SiteHeader";

// The site header, inside a project only: "Question bank", "Questionnaires" and
// "How the AI card is built" sit in one "Questionnaire setup" menu.

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
  [...container.querySelectorAll("nav a")].map((a) => [
    a.textContent,
    a.getAttribute("href"),
  ]);

// The links directly in the bar, and the menu's own label, in the order they read.
const barItems = (container: HTMLElement) =>
  [...container.querySelectorAll("nav > a, nav > details > summary")].map(
    (el) => el.textContent,
  );

const menu = (container: HTMLElement) =>
  container.querySelector("nav details") as HTMLDetailsElement;

describe("the site header", () => {
  it('inside a project the bar reads "Latest AI card", "AI card versions", "Questionnaire setup"', () => {
    const { container } = render(<SiteHeader project="demo" />);
    expect(barItems(container)).toEqual([
      "Latest AI card",
      "AI card versions",
      "Questionnaire setup",
    ]);
  });

  it("Back is a button of its own in the bar, outside the links a card page moves into its menu", () => {
    const { container } = render(<SiteHeader project="demo" />);
    const back = container.querySelector("a.site-back")!;
    expect(back.textContent).toBe("← Back to the project");
    expect(back.getAttribute("href")).toBe("http://launcher.test/p/demo");
    expect(back.classList.contains("btn")).toBe(true);
    expect(back.closest("nav")).toBeNull();
  });

  it("no Back button outside a project", () => {
    const { container } = render(<SiteHeader />);
    expect(container.querySelector("a.site-back")).toBeNull();
  });

  it("the Questionnaire setup menu holds Question bank, Questionnaires and How the AI card is built, inside the project", () => {
    const { container } = render(<SiteHeader project="demo" />);
    const items = [...menu(container).querySelectorAll("a")].map((a) => [
      a.textContent,
      a.getAttribute("href"),
    ]);
    expect(items).toEqual([
      ["Question bank", "/p/demo/question-sets"],
      ["Questionnaires", "/p/demo/questionnaires"],
      ["How the AI card is built", "/methodology"],
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

  it("without a project there is no menu, only How the AI card is built", () => {
    const { container } = render(<SiteHeader />);
    expect(menu(container)).toBeNull();
    expect(navLinks(container)).toEqual([
      ["How the AI card is built", "/methodology"],
    ]);
  });
});
