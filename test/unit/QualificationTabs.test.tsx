// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import QualificationTabs from "@/app/qualify/[id]/QualificationTabs";

afterEach(cleanup);

function mount() {
  return render(
    <QualificationTabs
      form={<p>the fourteen answers</p>}
      card={<p>the filled ontology</p>}
    />,
  );
}

describe("the two tabs of a compiled qualification", () => {
  it("offers exactly the answered form and the AI card", () => {
    const { container } = mount();
    const tabs = [...container.querySelectorAll('[role="tab"]')].map(
      (t) => t.textContent,
    );
    expect(tabs).toEqual(["Answered form", "AI card"]);
  });

  it("opens on the answered form", () => {
    mount();
    expect(screen.getByText("the fourteen answers")).toBeTruthy();
    expect(screen.queryByText("the filled ontology")).toBeNull();
    expect(
      screen.getByRole("tab", { name: "Answered form" }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("swaps to the AI card when that tab is clicked", () => {
    mount();
    // fireEvent, not .click(): the state update has to run inside act() for
    // the swapped panel to be in the DOM by the next assertion.
    fireEvent.click(screen.getByRole("tab", { name: "AI card" }));
    expect(screen.getByText("the filled ontology")).toBeTruthy();
    expect(screen.queryByText("the fourteen answers")).toBeNull();
    expect(
      screen.getByRole("tab", { name: "AI card" }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("wires each panel to its tab for a screen reader", () => {
    const { container } = mount();
    const tab = screen.getByRole("tab", { name: "Answered form" });
    const panel = container.querySelector('[role="tabpanel"]')!;
    expect(panel.getAttribute("aria-labelledby")).toBe(tab.id);
    expect(tab.id).toBeTruthy();
  });
});
