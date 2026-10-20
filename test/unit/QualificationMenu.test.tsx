// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import QualificationMenu from "@/app/p/[project]/qualify/[id]/QualificationMenu";

afterEach(cleanup);

// A compiled qualification is too long to scroll: a menu on the left shows one
// part at a time, the parts of the answered form and then the AI card, with the
// site's own links at its bottom.
function mount() {
  return render(
    <QualificationMenu
      parts={[
        { id: "system", label: "The system", content: <p>the identity</p> },
        { id: "group-0", label: "Annex IV 1", content: <p>the answers</p> },
        { id: "risks", label: "Risks (2)", content: <p>the two risks</p> },
      ]}
      card={<p>the filled ontology</p>}
      header={<h1>MCAS</h1>}
      nav={<a href="/p/demo/questionnaires">Questionnaires</a>}
    />,
  );
}

const items = (container: HTMLElement) =>
  [...container.querySelectorAll(".qf-sidemenu button")].map(
    (b) => b.textContent,
  );

describe("the left menu of a compiled qualification", () => {
  it("lists the parts of the answered form, then the AI card", () => {
    const { container } = mount();
    expect(items(container)).toEqual([
      "The system",
      "Annex IV 1",
      "Risks (2)",
      "AI card",
    ]);
  });

  it("opens on the first part, and shows that part only", () => {
    mount();
    expect(screen.getByText("the identity")).toBeTruthy();
    expect(screen.queryByText("the answers")).toBeNull();
    expect(screen.queryByText("the filled ontology")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "The system" })
        .getAttribute("aria-current"),
    ).toBe("true");
  });

  it("swaps to the part picked, and only that part", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Risks (2)" }));
    expect(screen.getByText("the two risks")).toBeTruthy();
    expect(screen.queryByText("the identity")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Risks (2)" })
        .getAttribute("aria-current"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "The system" })
        .getAttribute("aria-current"),
    ).toBeNull();
  });

  it("shows the AI card when it is picked", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "AI card" }));
    expect(screen.getByText("the filled ontology")).toBeTruthy();
    expect(screen.queryByText("the identity")).toBeNull();
  });

  it("puts the site's links at the bottom of the menu, after the AI card", () => {
    const { container } = mount();
    const menu = container.querySelector(".qf-sidemenu")!;
    const all = [...menu.querySelectorAll("button, a")].map(
      (el) => el.textContent,
    );
    expect(all[all.length - 1]).toBe("Questionnaires");
    expect(all.indexOf("AI card")).toBeLessThan(all.indexOf("Questionnaires"));
  });

  it("names the panel after the part it shows", () => {
    const { container } = mount();
    const panel = container.querySelector(".qf-sidepanel")!;
    expect(panel.getAttribute("aria-label")).toBe("The system");
  });

  it("puts the card's title at the top of the panel, above every part", () => {
    const { container } = mount();
    const panel = container.querySelector(".qf-sidepanel")!;
    expect(panel.firstElementChild!.textContent).toBe("MCAS");
    fireEvent.click(screen.getByRole("button", { name: "AI card" }));
    expect(panel.firstElementChild!.textContent).toBe("MCAS");
    expect(container.querySelector(".qf-sidemenu h1")).toBeNull();
  });
});

describe("the left menu, keeping every part mounted (the form being filled)", () => {
  it("has no AI card entry without a card, and hides the parts out of view rather than removing them", () => {
    const { container } = render(
      <QualificationMenu
        keepMounted
        parts={[
          { id: "a", label: "First", content: <input name="one" /> },
          { id: "b", label: "Second", content: <input name="two" /> },
        ]}
      />,
    );
    expect(items(container)).toEqual(["First", "Second"]);
    const two = container.querySelector('[name="two"]')!;
    expect((two.closest(".qf-sidepart") as HTMLElement).hidden).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Second" }));
    expect((two.closest(".qf-sidepart") as HTMLElement).hidden).toBe(false);
    expect(container.querySelector('[name="one"]')).not.toBeNull();
  });

  it("shows a footer under every part", () => {
    const { container } = render(
      <QualificationMenu
        keepMounted
        parts={[{ id: "a", label: "First", content: <p>one</p> }]}
        footer={<button type="submit">Save</button>}
      />,
    );
    const panel = container.querySelector(".qf-sidepanel")!;
    expect(panel.lastElementChild!.textContent).toBe("Save");
  });
});
