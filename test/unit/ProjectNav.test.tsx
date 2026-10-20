// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import ProjectNav from "@/components/ProjectNav";

// The project's links, on their own: the site header shows them top right, and
// the card page's left menu shows them at its bottom.
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

describe("the project nav", () => {
  it("reads Latest AI card, AI card versions, then the Questionnaire setup menu: Back is the header's own button", () => {
    const { container } = render(<ProjectNav project="demo" />);
    const items = [
      ...container.querySelectorAll("nav > a, nav > details > summary"),
    ].map((el) => el.textContent);
    expect(items).toEqual([
      "Latest AI card",
      "AI card versions",
      "Questionnaire setup",
    ]);
    const framework = [...container.querySelectorAll("nav details a")].map(
      (a) => a.getAttribute("href"),
    );
    expect(framework).toEqual([
      "/p/demo/question-sets",
      "/p/demo/questionnaires",
      "/methodology",
    ]);
  });

  it("leaves Latest AI card out where the page already is the card (a card, or its edit form)", () => {
    const { container } = render(
      <ProjectNav project="demo" withSystem={false} />,
    );
    const items = [
      ...container.querySelectorAll("nav > a, nav > details > summary"),
    ].map((el) => el.textContent);
    expect(items).toEqual(["AI card versions", "Questionnaire setup"]);
  });
});
