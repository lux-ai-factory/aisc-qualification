// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import QualifyForm from "@/app/qualify/new/QualifyForm";
import { findExample } from "@/data/examples";
import { sectors, targetSystems } from "@/data";
import { KEY_QUESTIONS } from "@/data/keyQuestions";

afterEach(cleanup);

const example = findExample("mcas")!;

const mount = (initial = example) =>
  render(
    <QualifyForm
      keyQuestions={KEY_QUESTIONS}
      targetSystems={targetSystems}
      sectors={sectors}
      initial={initial}
    />,
  );

describe("opening the form on a worked example", () => {
  it("fills the metadata, so it can be read and corrected", () => {
    const { container } = mount();
    const value = (name: string) =>
      (container.querySelector(`[name="${name}"]`) as HTMLInputElement).value;
    expect(value("systemName")).toBe("MicroCredit Assist Score (MCAS)");
    expect(value("systemVersion")).toBe("v1.2.0");
    expect(value("description")).toMatch(/creditworthiness/);
    expect(value("targetUsers")).toMatch(/loan officers/);
  });

  it("preselects the tags as hidden inputs the parser will read", () => {
    const { container } = mount();
    const hidden = (name: string) =>
      [...container.querySelectorAll(`input[type="hidden"][name="${name}"]`)].map(
        (i) => (i as HTMLInputElement).value,
      );
    expect(hidden("targetSystemTags")).toContain(
      "predictive-analytical-ai:risk-scoring-assessment",
    );
    expect(hidden("sectorTags")).toEqual(["finance-and-insurance"]);
    expect(hidden("marketFormTags")).toEqual(["software", "service"]);
    expect(hidden("localityTags")).toContain("workplace");
  });

  it("fills every Annex IV answer it has one for", () => {
    const { container } = mount();
    const filled = [...container.querySelectorAll("textarea")].filter(
      (t) => t.name.startsWith("q:") && t.value.trim().length > 0,
    );
    expect(filled.length).toBe(Object.keys(example.answers).length);
    const lineage = container.querySelector(
      '[name="q:annex-1:1a"]',
    ) as HTMLTextAreaElement;
    expect(lineage.value).toMatch(/retrieval-grounded/);
  });

  it("opens one risk row per risk in the example, filled", () => {
    const { container } = mount();
    const rows = container.querySelectorAll("fieldset.qf-risk");
    expect(rows.length).toBe(example.risks.length);
    const first = rows[0];
    expect(
      (first.querySelector('[name$=":risk"]') as HTMLTextAreaElement).value,
    ).toMatch(/wrongly ranked as high risk/);
    expect(
      (first.querySelector('[name$=":affected"]') as HTMLSelectElement).value,
    ).toBe("user");
    const areas = [
      ...first.querySelectorAll('input[type="hidden"][name$=":area"]'),
    ].map((i) => (i as HTMLInputElement).value);
    expect(areas).toContain("right");
  });

  it("stays empty when no example is asked for", () => {
    const { container } = render(
      <QualifyForm
        keyQuestions={KEY_QUESTIONS}
        targetSystems={targetSystems}
        sectors={sectors}
      />,
    );
    expect(
      (container.querySelector('[name="systemName"]') as HTMLInputElement).value,
    ).toBe("");
    expect(container.querySelectorAll("fieldset.qf-risk").length).toBe(1);
    expect(
      container.querySelectorAll('input[type="hidden"][name="sectorTags"]').length,
    ).toBe(0);
  });

  it("stays editable", () => {
    const { container } = mount();
    const name = container.querySelector('[name="systemName"]') as HTMLInputElement;
    expect(name.readOnly).toBe(false);
    expect(name.disabled).toBe(false);
  });
});

describe("the worked example itself", () => {
  it("names every field the parser requires", () => {
    for (const key of [
      "systemName",
      "systemVersion",
      "company",
      "description",
      "targetUseCase",
      "targetUsers",
    ] as const) {
      expect(example.metadata[key].length).toBeGreaterThan(0);
    }
  });

  it("answers every question the form asks, or says why not", () => {
    const asked = KEY_QUESTIONS.map((q) => `q:${q.group}:${q.id}`);
    for (const field of asked) {
      expect(Object.keys(example.answers)).toContain(field);
    }
  });

  it("answers the optional questions too, including the one that does not apply", () => {
    // A "where applicable" sub-item still gets an answer: an explicit "no" is
    // documentation, a blank box is an omission a reader cannot tell apart from
    // an oversight.
    expect(example.answers["q:annex-1:1f"]).toMatch(/no physical product/i);
  });

  it("uses only vocabulary ids the pickers offer", () => {
    const areaIds = new Set(["health", "safety", "right", "freedom"]);
    for (const row of example.risks) {
      expect(["operator", "user"]).toContain(row.affected);
      for (const area of row.areas) expect(areaIds.has(area)).toBe(true);
    }
  });
});
