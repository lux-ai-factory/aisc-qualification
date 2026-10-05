// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { formVersion } from "../support/forms";

// The "Questionnaire:" line of the card and edit pages, with the export links for the very
// version the card was filled with.
//
// FormLine (src/app/p/[project]/FormLine.tsx), props
//   { project, questionnaireId, questionnaireName, versionNumber, basePath?, newer? }
// (the tests also pass `form`, the resolved version, so a component that reads that instead
// works the same):
//   <p className="qf-row-form">Questionnaire: <name> v<N> · JSON · CSV · Markdown</p>
// With `newer: {versionId, versionNumber}`: p.qf-questionnaire-update
//   "<name> has a newer version, v<M>." and a link "Move to v<M>".

const FILE = "src/app/p/[project]/FormLine.tsx";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = async (): Promise<any> =>
  (await import(/* @vite-ignore */ resolve(FILE))).default;

afterEach(cleanup);

/** The props both ways: the flat ones and the resolved version. */
function props(
  id: string,
  name: string,
  versionNumber: number,
  over: Record<string, unknown> = {},
) {
  return {
    questionnaireId: id,
    questionnaireName: name,
    versionNumber,
    form: formVersion({
      questionnaireId: id,
      questionnaireName: name,
      versionNumber,
      versionId: `${id}-v${versionNumber}`,
    }),
    ...over,
  };
}

async function mount(p: Record<string, unknown>) {
  const FormLine = await load();
  return render(createElement(FormLine, p));
}

describe("FormLine (R58, T42)", () => {
  it("T42 reads Questionnaire: <name> v<N> · JSON · CSV · Markdown in p.qf-row-form", async () => {
    const { container } = await mount({
      project: "demo",
      ...props("acme", "Acme AI policy", 3),
    });
    const p = container.querySelector("p.qf-row-form");
    expect(p?.textContent).toBe(
      "Questionnaire: Acme AI policy v3 · JSON · CSV · Markdown",
    );
    expect(p?.querySelector("span.qf-row-form-name")?.textContent).toBe(
      "Questionnaire: Acme AI policy v3",
    );
    expect(p?.querySelectorAll("span.qf-row-form-sep")).toHaveLength(3);
  });

  it("T42 the three links export that exact version under /questionnaires/, named for a screen reader, with download", async () => {
    await mount({
      project: "demo",
      ...props("u1 x", "Custom questions: MCAS, 2026-09-25", 1),
    });
    const name = "Custom questions: MCAS, 2026-09-25 v1";
    const json = screen.getByRole("link", { name: `Export ${name} as JSON` });
    const csv = screen.getByRole("link", { name: `Export ${name} as CSV` });
    const md = screen.getByRole("link", { name: `Export ${name} as Markdown` });
    expect(json.textContent).toBe("JSON");
    expect(csv.textContent).toBe("CSV");
    expect(md.textContent).toBe("Markdown");
    expect(json.getAttribute("href")).toBe(
      "/p/demo/questionnaires/u1%20x/export?format=json&version=1",
    );
    expect(csv.getAttribute("href")).toBe(
      "/p/demo/questionnaires/u1%20x/export?format=csv&version=1",
    );
    expect(md.getAttribute("href")).toBe(
      "/p/demo/questionnaires/u1%20x/export?format=md&version=1",
    );
    for (const a of [json, csv, md])
      expect(a.hasAttribute("download")).toBe(true);
  });

  it("T42 the base path prefixes every link", async () => {
    await mount({
      project: "demo",
      basePath: "/qualification",
      ...props("acme", "Acme AI policy", 2),
    });
    expect(
      screen
        .getByRole("link", { name: "Export Acme AI policy v2 as JSON" })
        .getAttribute("href"),
    ).toBe(
      "/qualification/p/demo/questionnaires/acme/export?format=json&version=2",
    );
  });

  it("T42 a legacy card's line is Questionnaire: Annex IV default v1, exporting annex-iv-default v1", async () => {
    const { container } = await mount({
      project: "mcas",
      ...props("annex-iv-default", "Annex IV default", 1),
    });
    expect(container.querySelector("p.qf-row-form")?.textContent).toBe(
      "Questionnaire: Annex IV default v1 · JSON · CSV · Markdown",
    );
    expect(
      screen
        .getByRole("link", { name: "Export Annex IV default v1 as CSV" })
        .getAttribute("href"),
    ).toBe(
      "/p/mcas/questionnaires/annex-iv-default/export?format=csv&version=1",
    );
  });

  it("T42 without `newer` there is no update line", async () => {
    const { container } = await mount({
      project: "demo",
      ...props("acme", "Acme AI policy", 2),
    });
    expect(container.querySelector("p.qf-questionnaire-update")).toBeNull();
    expect(screen.queryByRole("link", { name: /Move to v/ })).toBeNull();
  });

  it("T42 with `newer`, the line says the questionnaire has a newer version and links Move to v<M>", async () => {
    const { container } = await mount({
      project: "demo",
      ...props("acme", "Acme AI policy", 2),
      newer: { versionId: "acme-v5", versionNumber: 5 },
    });
    const p = container.querySelector("p.qf-questionnaire-update");
    expect(p?.textContent).toContain("Acme AI policy has a newer version, v5.");
    const move = screen.getByRole("link", { name: "Move to v5" });
    expect(move.getAttribute("href")).toMatch(
      /\/p\/demo\/system\/edit\?questionnaireVersion=acme-v5$/,
    );
  });
});

describe("the card and edit pages use it (R58, R66, T42)", () => {
  const CARD = "src/app/p/[project]/qualify/[id]/page.tsx";
  const EDIT = "src/app/p/[project]/system/edit/page.tsx";

  it.each([CARD, EDIT])(
    "T42 %s renders <FormLine> and no own Form: or Questionnaire: paragraph",
    (file) => {
      const src = readFileSync(file, "utf8");
      expect(src).toMatch(/<FormLine\b/);
      expect(src).not.toMatch(/Form: \{/);
      expect(src).not.toMatch(/Questionnaire: \{/);
    },
  );

  it("T42 the card page resolves the card's questionnaire version (the default version for a legacy card) and asks newerVersion", () => {
    const src = readFileSync(CARD, "utf8");
    expect(src).toMatch(
      /resolve\(q\.questionnaireVersionId \?\? null\)\)\s*\?\?\s*annexDefaultVersion\(\)/,
    );
    expect(src).toMatch(/\bnewerVersion\(/);
    expect(src).toMatch(/<FormLine[^>]*\bnewer=/);
    expect(src).not.toMatch(/formVersionId/);
  });
});
