// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import NodeEditor from "@/app/qualify/[id]/NodeEditor";
import type { OntologyNode } from "@/domain/OntologyView";

afterEach(cleanup);

const node = (over: Partial<OntologyNode> = {}): OntologyNode => ({
  id: "risk0_control",
  label: "Officer review of every Reject",
  cls: "RiskControl",
  vair: "ManualControl",
  fullText:
    "Every Reject and every Review case goes to a trained loan officer before any decision reaches the applicant.",
  provenance: "form",
  ...over,
});

const VOCAB = {
  RiskControl: ["ManualControl", "MitigationMeasure", "MonitoringMeasure"],
  Risk: [],
  AIOperator: ["PublicAuthority", "EUAgency"],
};

function mount(over: Partial<OntologyNode> = {}, handlers = {}) {
  const props = {
    node: node(over),
    vocabularies: VOCAB,
    pending: false,
    onCancel: vi.fn(),
    onSave: vi.fn(),
    ...handlers,
  };
  const rendered = render(<NodeEditor {...props} />);
  // The dialog is portalled to document.body, so that is where to look for it,
  // not in the render container.
  return { ...rendered, props, panel: document.body };
}

describe("NodeEditor as a pop-up", () => {
  it("renders as a dialog above the canvas, not inside a node", () => {
    const { panel } = mount();
    expect(panel.querySelector('[role="dialog"]')).toBeTruthy();
    // it must not be positioned by the flow transform
    expect(panel.querySelector(".react-flow__node")).toBeNull();
    expect(panel.querySelector(".onto-popover")).toBeTruthy();
  });

  it("shows the node's class and its vocabulary term", () => {
    mount();
    expect(screen.getByText("RiskControl")).toBeTruthy();
    expect(
      (screen.getByLabelText(/vocabulary term/i) as HTMLSelectElement).value,
    ).toBe("ManualControl");
  });

  it("shows the full source text, which the chip can only truncate", () => {
    mount();
    expect(
      screen.getByText(/before any decision reaches the applicant/),
    ).toBeTruthy();
  });

  it("offers only the terms valid for that class", () => {
    const { panel } = mount();
    const options = [...panel.querySelectorAll("option")].map(
      (o) => o.textContent,
    );
    expect(options).toEqual([
      "none",
      "ManualControl",
      "MitigationMeasure",
      "MonitoringMeasure",
    ]);
  });

  it("explains itself instead of offering an empty dropdown when no term exists", () => {
    const { panel } = mount({ cls: "Risk", vair: null });
    expect(panel.querySelector("select")).toBeNull();
    expect(
      screen.getByText(/vocabulary defines no term for this kind of node/i),
    ).toBeTruthy();
  });

  it("saves the name, the term and the reason", () => {
    const onSave = vi.fn();
    const { panel } = mount({}, { onSave });
    // fireEvent, not input.value = ...: React tracks the value itself, so a raw
    // assignment never reaches state.
    fireEvent.change(panel.querySelector('input[name="label"]')!, {
      target: { value: "Officer review of rejections" },
    });
    fireEvent.change(panel.querySelector("select")!, {
      target: { value: "MitigationMeasure" },
    });
    (panel.querySelector('[data-testid="save"]') as HTMLElement).click();
    // termNotApplicable travels with every save for a class that has terms, so
    // unticking it is as recordable as ticking it.
    expect(onSave).toHaveBeenCalledWith({
      label: "Officer review of rejections",
      termNotApplicable: false,
      vair: "MitigationMeasure",
    });
  });

  it("says what the agent flagged, so a reviewer knows what to look at", () => {
    const { panel } = mount({
      provenance: "extracted",
      flags: ["ungrounded"],
    });
    expect(panel.textContent).toContain("ungrounded");
    expect(screen.getByText(/review flagged this/i)).toBeTruthy();
  });

  it("closes on Escape", () => {
    const onCancel = vi.fn();
    mount({}, { onCancel });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("closes when the backdrop is clicked", () => {
    const onCancel = vi.fn();
    const { panel } = mount({}, { onCancel });
    (panel.querySelector(".onto-backdrop") as HTMLElement).click();
    expect(onCancel).toHaveBeenCalled();
  });

  it("does not close when the panel itself is clicked", () => {
    const onCancel = vi.fn();
    const { panel } = mount({}, { onCancel });
    (panel.querySelector(".onto-popover") as HTMLElement).click();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("refuses to save an empty name", () => {
    const { panel } = mount();
    fireEvent.change(panel.querySelector('input[name="label"]')!, {
      target: { value: "   " },
    });
    expect(
      (panel.querySelector('[data-testid="save"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("shows what a reviewer changed, when there is a record of it", () => {
    const { panel } = mount({
      provenance: "reviewed",
      generatedLabel: "Mandatory officer review before any decision",
      reviewNote: "shortened to the control itself",
    });
    expect(
      screen.getByText("Mandatory officer review before any decision"),
    ).toBeTruthy();
    expect(
      (panel.querySelector('input[value*="shortened"]') as HTMLInputElement)
        ?.value ?? "",
    ).toContain("shortened to the control itself");
    expect(screen.getByText("reviewed")).toBeTruthy();
  });

  /**
   * Rendered through a portal to document.body, not inside the ontology
   * section. The section is about to break out of the page's 820px column to
   * use the full width, and any transformed or filtered ancestor would turn
   * this dialog's `position: fixed` into `absolute`, trapping the backdrop
   * inside the section.
   */
  it("escapes its container by rendering into document.body", () => {
    const { container } = mount();
    expect(container.querySelector(".onto-backdrop")).toBeNull();
    expect(document.body.querySelector(".onto-backdrop")).toBeTruthy();
    expect(document.body.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it("offers a way to record that no term in the list fits", () => {
    const onSave = vi.fn();
    const { panel } = mount({ vair: null }, { onSave });
    const mark = panel.querySelector(
      '[data-testid="term-not-applicable"]',
    ) as HTMLInputElement;
    expect(mark).toBeTruthy();
    fireEvent.click(mark);
    (panel.querySelector('[data-testid="save"]') as HTMLElement).click();
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ termNotApplicable: true }),
    );
  });

  it("explains a vocabulary that names a different population", () => {
    const { panel } = mount({
      cls: "AIOperator",
      vair: null,
      termExpected: false,
    });
    // The terms are still offered: a deployer that IS a public authority should
    // carry one. What goes is the "none applies" mark, which existed only to
    // silence a flag that is no longer raised.
    expect(panel.querySelector("select")).toBeTruthy();
    expect(
      panel.querySelector('[data-testid="term-not-applicable"]'),
    ).toBeNull();
    expect(screen.getByText(/name a population this node is not part of/i)).toBeTruthy();
  });

  it("saves a term picked from a partial vocabulary, without any mark", () => {
    const onSave = vi.fn();
    const { panel } = mount(
      { cls: "AIOperator", vair: null, termExpected: false },
      { onSave },
    );
    fireEvent.change(panel.querySelector("select")!, {
      target: { value: "PublicAuthority" },
    });
    (panel.querySelector('[data-testid="save"]') as HTMLElement).click();
    expect(onSave).toHaveBeenCalledWith({
      label: "Officer review of every Reject",
      vair: "PublicAuthority",
    });
  });

  it("does not offer the mark when the class has no terms anyway", () => {
    const { panel } = mount({ cls: "Risk", vair: null });
    expect(
      panel.querySelector('[data-testid="term-not-applicable"]'),
    ).toBeNull();
  });

  it("shows the mark already set, and lets it be cleared", () => {
    const onSave = vi.fn();
    const { panel } = mount(
      { vair: null, termNotApplicable: true },
      { onSave },
    );
    const mark = panel.querySelector(
      '[data-testid="term-not-applicable"]',
    ) as HTMLInputElement;
    expect(mark.checked).toBe(true);
    fireEvent.click(mark);
    (panel.querySelector('[data-testid="save"]') as HTMLElement).click();
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ termNotApplicable: false }),
    );
  });
});
