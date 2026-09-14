// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import SubmitOverlay, { STAGES } from "@/app/qualify/new/SubmitOverlay";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the overlay while a qualification is being turned into a card", () => {
  it("is hidden until the form is submitted", () => {
    render(<SubmitOverlay open={false} />);
    expect(document.body.querySelector(".submit-overlay")).toBeNull();
  });

  it("appears on submit, over everything", () => {
    render(<SubmitOverlay open />);
    // portalled to body: the form is inside a column with its own stacking
    // context, and a backdrop has to cover the page
    expect(document.body.querySelector(".submit-overlay")).toBeTruthy();
  });

  it("says what is happening, to a screen reader too", () => {
    render(<SubmitOverlay open />);
    const status = document.body.querySelector('[role="status"]')!;
    expect(status).toBeTruthy();
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toMatch(/AI card/);
  });

  it("names the filler's stages, which saving now starts", () => {
    render(<SubmitOverlay open />);
    const all = [...document.body.querySelectorAll(".submit-stage")]
      .map((li) => li.textContent ?? "")
      .join(" ");
    expect(all).toMatch(/draft/i);
    expect(all).toMatch(/vocabulary|terms/i);
    expect(all).toMatch(/review/i);
  });

  it("names only the work that actually runs on submit", () => {
    // Only the work saving actually sets off may be named here.
    render(<SubmitOverlay open />);
    const items = [...document.body.querySelectorAll(".submit-stage")].map(
      (li) => li.textContent ?? "",
    );
    expect(items.length).toBe(STAGES.length);
    const all = items.join(" ");
    expect(all).toMatch(/answers/i);
    expect(all).toMatch(/sav/i);
    // and nothing that no longer happens here
    expect(all).not.toMatch(/assembling/i);
  });

  it("moves through the stages while it waits", () => {
    vi.useFakeTimers();
    render(<SubmitOverlay open />);
    const current = () =>
      document.body.querySelector(".submit-stage.is-current")?.textContent ?? "";
    expect(current()).toBe(STAGES[0]);
    act(() => {
      vi.advanceTimersByTime(1400);
    });
    expect(current()).toBe(STAGES[1]);
  });

  it("holds on the last stage", () => {
    // The run finishes after the redirect, which this component cannot see, so
    // it holds rather than looping or ticking everything off.
    vi.useFakeTimers();
    render(<SubmitOverlay open />);
    act(() => {
      vi.advanceTimersByTime(1400 * (STAGES.length + 6));
    });
    const current =
      document.body.querySelector(".submit-stage.is-current")?.textContent ?? "";
    expect(current).toBe(STAGES[STAGES.length - 1]);
  });

  it("shows no percentage", () => {
    render(<SubmitOverlay open />);
    const text = document.body.querySelector(".submit-overlay")!.textContent ?? "";
    expect(text).not.toMatch(/%|\d+ *of *\d+/);
  });

  it("draws the conversion: answers, the loop, the card", () => {
    render(<SubmitOverlay open />);
    const svg = document.body.querySelector("svg.submit-anim")!;
    expect(svg).toBeTruthy();
    expect(svg.getAttribute("aria-hidden")).toBe("true"); // the text says it
    expect(svg.querySelector(".submit-anim-answers")).toBeTruthy();
    expect(svg.querySelector(".submit-anim-loop")).toBeTruthy();
    expect(svg.querySelector(".submit-anim-card")).toBeTruthy();
    // and the conversion has to be visible as movement in both halves: into
    // the loop from the answers, and out of it into the card
    expect(svg.querySelector(".submit-anim-flow")).toBeTruthy();
    expect(svg.querySelector(".submit-anim-flow--out")).toBeTruthy();
  });

  it("stands still for anyone who asked for less motion", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion"));
    expect(block).toMatch(/submit-anim|submit-overlay/);
  });
});
