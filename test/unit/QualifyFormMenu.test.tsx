// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

vi.mock("@/app/p/[project]/qualify/new/prefill-actions", () => ({
  readDocument: vi.fn(),
}));
vi.mock("@/app/p/[project]/qualify/new/actions", () => ({
  submitQualification: vi.fn(),
}));

import QualifyForm from "@/app/p/[project]/qualify/new/QualifyForm";
import { annexDefaultVersion } from "@/domain/forms/legacy";

// Filling the form uses the same left menu as the saved card: one part in view at
// a time, the title at the top of the panel, the project's links at the bottom
// of the menu. Every part stays in the form, so everything is still posted.

afterEach(cleanup);

const v = annexDefaultVersion();
const groups = [...new Set(v.questions.map((q) => q.groupLabel ?? q.setName))];

function mount(props: { saveLabel?: string; cancelHref?: string } = {}) {
  return render(
    <QualifyForm
      project="mcas"
      form={v}
      header={<h1>Edit the AI system</h1>}
      nav={<a href="/p/mcas/questionnaires">Questionnaires</a>}
      {...props}
    />,
  );
}

const menuItems = () =>
  [...document.querySelectorAll(".qf-sidemenu button")].map(
    (b) => b.textContent,
  );
const shownParts = () =>
  [...document.querySelectorAll(".qf-sidepart")].filter(
    (p) => !(p as HTMLElement).hidden,
  );

describe("the form being filled, with the left menu", () => {
  it("lists the system, each question group, the components and the risks; no AI card yet", () => {
    mount();
    expect(menuItems()).toEqual([
      "Identification and use",
      ...groups,
      "System components",
      "Risk identification",
    ]);
  });

  it("names the first part's fields in the reader's words: Identification, System release, Provider type", () => {
    mount();
    const part = shownParts()[0];
    const heads = [...part.querySelectorAll("h2")].map((h) => h.textContent);
    expect(heads).toContain("Identification");
    expect(heads).not.toContain("System metadata");
    expect(part.textContent).toContain("System release");
    expect(part.textContent).toContain("Provider type");
    expect(part.textContent).toContain("Deployer type");
    expect(part.textContent).not.toMatch(/Kind of (provider|deployer)/);
  });

  it("opens on the system, with the document upload, and keeps every other part in the form", () => {
    mount();
    expect(shownParts()).toHaveLength(1);
    expect(shownParts()[0].textContent).toContain("Start from a document");
    expect(shownParts()[0].querySelector('[name="systemName"]')).not.toBeNull();
    const form = document.querySelector("form")!;
    for (const q of v.questions)
      expect(form.querySelector(`[name="${q.field}"]`)).not.toBeNull();
  });

  it("shows the part picked, and only that part", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: groups[1] }));
    expect(shownParts()).toHaveLength(1);
    expect(shownParts()[0].querySelector("h2")!.textContent).toBe(groups[1]);
    fireEvent.click(screen.getByRole("button", { name: "Risk identification" }));
    expect(shownParts()[0].textContent).toContain("Risk 1");
  });

  it("an empty required field in a hidden part brings that part into view", () => {
    vi.useFakeTimers();
    try {
      mount();
      const risk = document.querySelector(
        '.qf-sidepart [name^="risk"][required]',
      ) as HTMLElement;
      const part = risk.closest(".qf-sidepart") as HTMLElement;
      expect(part.hidden).toBe(true);
      act(() => {
        fireEvent.invalid(risk);
      });
      expect(part.hidden).toBe(false);
      act(() => {
        vi.runAllTimers();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the save button in view whatever part is shown", () => {
    mount();
    const save = screen.getByRole("button", { name: "Save the AI card" });
    expect(save.closest(".qf-sidepart")).toBeNull();
    expect(save.closest(".qf-sidepanel")).not.toBeNull();
  });

  it("puts the title at the top of the panel and the project's links at the bottom of the menu", () => {
    mount();
    const panel = document.querySelector(".qf-sidepanel")!;
    expect(panel.firstElementChild!.textContent).toBe("Edit the AI system");
    const menuLinks = [
      ...document.querySelectorAll(".qf-sidemenu button, .qf-sidemenu a"),
    ].map((el) => el.textContent);
    expect(menuLinks.at(-1)).toBe("Questionnaires");
  });
});

describe("saving and leaving the form", () => {
  afterEach(() => vi.restoreAllMocks());

  it("says which version a save makes, beside a Cancel back to where the edit started", () => {
    mount({ saveLabel: "Save as v5", cancelHref: "/p/mcas/qualify/card-4" });
    const save = screen.getByRole("button", { name: "Save as v5" });
    const cancel = screen.getByRole("link", { name: "Cancel" });
    expect(cancel.getAttribute("href")).toBe("/p/mcas/qualify/card-4");
    expect(save.closest(".qf-actions")).toBe(cancel.closest(".qf-actions"));
  });

  it("an untouched form is left without a question", () => {
    mount({ cancelHref: "/p/mcas/qualifications" });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("link", { name: "Cancel" }));
    expect(fireEvent.click(screen.getByRole("link", { name: "Questionnaires" }))).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
  });

  it("once something is typed, leaving by any link asks first, and staying keeps the page", () => {
    mount({ cancelHref: "/p/mcas/qualifications" });
    fireEvent.input(document.querySelector('[name="systemName"]')!, {
      target: { value: "Changed" },
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    // (Cancel is a Next Link, which always handles its own click: what counts there is the question.)
    fireEvent.click(screen.getByRole("link", { name: "Cancel" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    const menuLink = screen.getByRole("link", { name: "Questionnaires" });
    expect(fireEvent.click(menuLink)).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(2);
    confirm.mockReturnValue(true);
    expect(fireEvent.click(menuLink)).toBe(true);
  });

  it("once something is typed, closing or reloading the tab asks the browser to warn", () => {
    mount();
    fireEvent.change(document.querySelector('[name="systemName"]')!, {
      target: { value: "Changed" },
    });
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
  });

  it("a download link (a questionnaire export) is not leaving", () => {
    render(
      <QualifyForm
        project="mcas"
        form={v}
        header={<a href="/export?format=json" download>JSON</a>}
      />,
    );
    fireEvent.input(document.querySelector('[name="systemName"]')!, {
      target: { value: "Changed" },
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("link", { name: "JSON" }));
    expect(confirm).not.toHaveBeenCalled();
  });
});
