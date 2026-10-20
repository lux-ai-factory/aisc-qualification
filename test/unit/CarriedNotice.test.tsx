// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import CarriedNotice from "@/app/p/[project]/qualify/[id]/CarriedNotice";

// What a card version took from the review of the card before it, said on its AI card: what came
// along, and what stayed on the version before (with a link to it), so nothing is dropped unseen.

afterEach(cleanup);

const href = "/p/mcas/qualify/card-3";

describe("the review a card version took from the one before", () => {
  it("names what came along", () => {
    render(
      <CarriedNotice
        fromHref={href}
        review={{ from_version: 3, carried: ["a", "b"], left: [], draft: "carried" }}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe(
      "Carried from v3: 2 corrections and the draft of AI suggestions.",
    );
  });

  it("names what stayed behind, and why, with the version it stayed on", () => {
    render(
      <CarriedNotice
        fromHref={href}
        review={{ from_version: 3, carried: ["a"], left: ["b"], draft: "left" }}
      />,
    );
    const text = screen.getByRole("status").textContent;
    expect(text).toContain("Carried from v3: 1 correction.");
    expect(text).toContain(
      "1 correction stayed on v3: its item is not the same in this version.",
    );
    expect(text).toContain(
      "The draft of AI suggestions stayed on v3: what it was read from changed. Let AI suggest additions again for this version.",
    );
    expect(screen.getByRole("link", { name: "v3" }).getAttribute("href")).toBe(href);
  });

  it("says when the review could not be carried at all", () => {
    render(
      <CarriedNotice
        fromHref={href}
        review={{ from_version: 3, carried: [], left: ["a", "b"], draft: "left", failed: "down" }}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe(
      "The review of v3 could not be carried to this version: its 2 corrections and its draft of AI suggestions are still on v3.",
    );
  });

  it("a draft alone that could not be carried is one thing still on the version before", () => {
    render(
      <CarriedNotice
        fromHref={href}
        review={{ from_version: 3, carried: [], left: [], draft: "left", failed: "down" }}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe(
      "The review of v3 could not be carried to this version: its draft of AI suggestions is still on v3.",
    );
  });

  it("says nothing when the card before had no review", () => {
    const { container } = render(
      <CarriedNotice
        fromHref={href}
        review={{ from_version: 3, carried: [], left: [], draft: "none" }}
      />,
    );
    expect(container.textContent).toBe("");
  });
});
