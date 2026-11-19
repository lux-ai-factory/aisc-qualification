// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

vi.mock("@/app/p/[project]/qualify/new/prefill-actions", () => ({
  readDocument: vi.fn(),
}));
vi.mock("@/app/p/[project]/qualify/new/actions", () => ({
  submitQualification: vi.fn(),
}));

import QualifyForm from "@/app/p/[project]/qualify/new/QualifyForm";
import { annexDefaultVersion } from "@/domain/forms/legacy";

// Save on a form with empty required fields: the browser flags every one of them
// at once, in page order, and refuses the save. The person must land on the
// first of them, in its part and on its page, and every other part and page must
// stay where it was: a later empty field must not move the view, nor turn a
// part's pages away from its first one.

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const form = () => document.querySelector("form") as HTMLFormElement;
const shownPart = () =>
  [...document.querySelectorAll<HTMLElement>(".qf-sidepart")].find(
    (p) => !p.hidden,
  )!;
const shownPage = (part: Element) =>
  [...part.querySelectorAll<HTMLElement>(".qf-carousel-page")].findIndex(
    (p) => !p.hidden,
  );
const firstEmpty = () =>
  ([...form().elements] as Field[]).find(
    (el) => el.willValidate && !el.validity.valid,
  )!;

/** What the browser does on Save: every invalid field gets its invalid event. */
function save() {
  act(() => {
    form().checkValidity();
  });
  act(() => {
    vi.runAllTimers();
  });
}

function fillFirstPart() {
  const part = document.querySelectorAll(".qf-sidepart")[0];
  for (const el of part.querySelectorAll<Field>("[required]")) {
    if (el instanceof HTMLSelectElement)
      el.value = [...el.options].find((o) => o.value)!.value;
    else el.value = "x";
  }
}

describe("Save with empty required fields", () => {
  it("on an empty form, shows the first empty field's part, and every part on its first page", () => {
    render(<QualifyForm project="mcas" form={annexDefaultVersion()} />);
    const first = firstEmpty();
    save();
    expect(shownPart().contains(first)).toBe(true);
    for (const part of document.querySelectorAll(".qf-sidepart"))
      if (part.querySelector(".qf-carousel-page"))
        expect(shownPage(part)).toBe(0);
  });

  it("with the first part filled, shows General description on its first page, not a later part", () => {
    render(<QualifyForm project="mcas" form={annexDefaultVersion()} />);
    fillFirstPart();
    const first = firstEmpty();
    const general = document.querySelectorAll(".qf-sidepart")[1];
    expect(general.querySelector("h2")!.textContent).toBe("General description");
    expect(general.contains(first)).toBe(true);
    save();
    expect(shownPart()).toBe(general);
    expect(shownPage(general)).toBe(0);
    for (const part of document.querySelectorAll(".qf-sidepart"))
      if (part.querySelector(".qf-carousel-page"))
        expect(shownPage(part)).toBe(0);
  });

  it("an empty field on a later page of a part shows that page, and only that part's pages move", () => {
    render(<QualifyForm project="mcas" form={annexDefaultVersion()} />);
    fillFirstPart();
    const general = document.querySelectorAll(".qf-sidepart")[1];
    const pages = general.querySelectorAll(".qf-carousel-page");
    for (const el of pages[0].querySelectorAll<Field>("[required]")) el.value = "x";
    const first = firstEmpty();
    expect(pages[1].contains(first)).toBe(true);
    save();
    expect(shownPart()).toBe(general);
    expect(shownPage(general)).toBe(1);
    for (const part of document.querySelectorAll(".qf-sidepart"))
      if (part !== general && part.querySelector(".qf-carousel-page"))
        expect(shownPage(part)).toBe(0);
  });
});
