// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

vi.mock("@/app/p/[project]/qualify/new/prefill-actions", () => ({
  readDocument: vi.fn(),
}));
vi.mock("@/app/p/[project]/qualify/new/actions", () => ({
  submitQualification: vi.fn(),
}));

import ComponentRows from "@/app/p/[project]/qualify/new/ComponentRows";
import RiskRows from "@/app/p/[project]/qualify/new/RiskRows";
import QualifyForm from "@/app/p/[project]/qualify/new/QualifyForm";
import { annexDefaultVersion } from "@/domain/forms/legacy";

// The components, the risks and the Technical documentation questions are carousels: one
// component, one risk, five questions per page. The pages out of view stay in the form, so
// everything is still posted, and an empty required field on one of them brings it into view.

afterEach(cleanup);

const component = (name: string) => ({
  key: "",
  name,
  role: "",
  type: "",
  provider: "in_house" as const,
  providerName: "",
});

const shownPages = () =>
  [...document.querySelectorAll(".qf-carousel-page")].filter(
    (p) => !(p as HTMLElement).hidden,
  );

describe("ComponentRows carousel", () => {
  it("shows one component per page and keeps the others in the form", () => {
    render(
      <ComponentRows
        initial={[component("A"), component("B"), component("C")]}
      />,
    );
    expect(document.querySelectorAll(".qf-carousel-page")).toHaveLength(3);
    expect(shownPages()).toHaveLength(1);
    expect(screen.getByText("Component 1 of 3")).toBeTruthy();
    // hidden pages still hold their fields, so they are posted
    expect(document.querySelector('[name="component:2:name"]')).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText("Component 2 of 3")).toBeTruthy();
    expect(
      within(shownPages()[0] as HTMLElement).getByDisplayValue("B"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Component 3" }));
    expect(screen.getByText("Component 3 of 3")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /next/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("a new component opens on its own page", () => {
    render(<ComponentRows initial={[component("A")]} />);
    fireEvent.click(screen.getByRole("button", { name: /add a component/i }));
    expect(screen.getByText("Component 2 of 2")).toBeTruthy();
    expect(
      (shownPages()[0] as HTMLElement).querySelector(
        '[name="component:1:name"]',
      ),
    ).not.toBeNull();
  });

  it("removing a component keeps what was typed in the ones after it", () => {
    render(
      <ComponentRows
        initial={[component("A"), component("B"), component("C")]}
      />,
    );
    const c = document.querySelector(
      '[name="component:2:name"]',
    ) as HTMLInputElement;
    fireEvent.change(c, { target: { value: "C typed" } });
    // remove the second
    fireEvent.click(screen.getByRole("button", { name: "Component 2" }));
    fireEvent.click(
      within(shownPages()[0] as HTMLElement).getByRole("button", {
        name: /remove/i,
      }),
    );
    expect(
      (document.querySelector('[name="component:1:name"]') as HTMLInputElement)
        .value,
    ).toBe("C typed");
  });
});

describe("RiskRows carousel", () => {
  it("shows one risk per page; a new risk opens on its own page", () => {
    render(<RiskRows />);
    expect(document.querySelectorAll(".qf-carousel-page")).toHaveLength(1);
    // a single page needs no navigation
    expect(screen.queryByRole("button", { name: /next/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /add another risk/i }));
    expect(screen.getByText("Risk 2 of 2")).toBeTruthy();
    expect(shownPages()).toHaveLength(1);
  });
});

describe("Technical documentation carousel", () => {
  const section = () =>
    screen
      .getByRole("heading", { name: "Technical documentation" })
      .closest("section") as HTMLElement;

  it("shows the questions five per page, every one still in the form", () => {
    const v = annexDefaultVersion();
    render(<QualifyForm project="mcas" form={v} />);
    const pages = section().querySelectorAll(".qf-carousel-page");
    expect(pages).toHaveLength(Math.ceil(v.questions.length / 5));
    for (const p of pages)
      expect(p.querySelectorAll("textarea").length).toBeLessThanOrEqual(5);
    expect(pages[0].querySelectorAll("textarea")).toHaveLength(5);
    for (const q of v.questions)
      expect(section().querySelector(`[name="${q.field}"]`)).not.toBeNull();
    // each page opens with its group: its heading, or a label saying it continues
    for (const p of pages) expect(p.querySelector(".qf-group")).not.toBeNull();
  });

  it("an empty required question on a hidden page brings its page into view", async () => {
    vi.useFakeTimers();
    try {
      const v = annexDefaultVersion();
      render(<QualifyForm project="mcas" form={v} />);
      const pages = section().querySelectorAll(".qf-carousel-page");
      const last = pages[pages.length - 1] as HTMLElement;
      expect(last.hidden).toBe(true);
      const field = last.querySelector("textarea[required]") as HTMLElement;
      act(() => {
        fireEvent.invalid(field);
      });
      expect(last.hidden).toBe(false);
      act(() => {
        vi.runAllTimers();
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
