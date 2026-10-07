// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";

import RiskRows from "@/app/p/[project]/qualify/new/RiskRows";

// A risk page is compact: a text answer and its VAIR select sit on one row, and the two
// questions that are only a select (kind of harm, who is affected) share a row. The posted
// field names do not change.

afterEach(cleanup);

const field = (name: string) =>
  document.querySelector(`[name="${name}"]`)!.closest(".field") as HTMLElement;

describe("RiskRows layout", () => {
  it("puts each text answer and its VAIR select side by side", () => {
    render(<RiskRows />);
    for (const id of ["source", "consequence", "control", "followUpControl"]) {
      const text = document.querySelector(`textarea[name="risk:0:${id}"]`)!;
      const term = document.querySelector(`select[name="risk:0:${id}Term"]`)!;
      const row = text.parentElement as HTMLElement;
      expect(row.classList.contains("qf-risk-answer"), id).toBe(true);
      expect(term.parentElement, id).toBe(row);
    }
  });

  it("gives a text answer with no VAIR select no side-by-side row", () => {
    render(<RiskRows />);
    for (const id of ["risk", "vulnerability"]) {
      const text = document.querySelector(`textarea[name="risk:0:${id}"]`)!;
      expect(text.parentElement!.classList.contains("qf-risk-answer"), id).toBe(false);
    }
  });

  it("lets the two select-only questions share a row and the others span it", () => {
    render(<RiskRows />);
    expect(field("risk:0:impactTerm").classList.contains("qf-risk-half")).toBe(true);
    expect(field("risk:0:affected").classList.contains("qf-risk-half")).toBe(true);
    for (const name of ["risk:0:risk", "risk:0:source", "risk:0:control"]) {
      expect(field(name).classList.contains("qf-risk-half"), name).toBe(false);
    }
  });
});

describe("form width", () => {
  const css = readFileSync(join(__dirname, "../../src/app/globals.css"), "utf8");
  const rule = (selector: string) => {
    const at = css.indexOf(`${selector} {`);
    expect(at, selector).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf("}", at));
  };

  it("is wider than the old 1080px but keeps a gutter, on the system edit page only", () => {
    expect(rule(".qualify-page--fill")).toMatch(/max-width:\s*min\(1440px,\s*calc\(100vw - 56px\)\)/);
    expect(rule(".qualify-page--form")).toMatch(/max-width:\s*1080px/);
  });

  it("lays a risk out on a two-column grid that folds to one on a narrow screen", () => {
    expect(rule(".qualify-form .qf-risk-fields")).toMatch(/grid-template-columns/);
    expect(css).toMatch(/@media \(max-width: 900px\)\s*{[^}]*\.qf-risk-fields/);
  });
});
