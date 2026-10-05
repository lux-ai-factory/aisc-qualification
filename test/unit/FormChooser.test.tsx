// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import FormChooser from "@/app/p/[project]/system/edit/FormChooser";
import { readFileSync } from "node:fs";

// The chooser on /p/[project]/system/edit when no questionnaire is named yet. A thin
// component: which option is checked comes from preselect() (test/unit/formChooser.test.ts).
//
// Props:
//   project, options: [{ questionnaireId, name, versionNumber, questionCount, isDefault,
//                        versionId /* latest */, versionIds /* oldest first */ }],
//   preselected: { param: "questionnaire" | "questionnaireVersion", id },
//   previous?: { cardVersionNumber, versionId, name, versionNumber } | null
//              the latest card and the questionnaire version it was filled with (P, resolved)
//   error?: string | null
// "Continue" navigates with router.push to /p/<project>/system/edit?<param>=<encodeURIComponent(id)>.

afterEach(cleanup);
beforeEach(() => push.mockReset());

const options = [
  // isDefault is computed, true exactly for annex-iv-default
  {
    questionnaireId: "annex-iv-default",
    name: "Annex IV default",
    versionNumber: 1,
    questionCount: 14,
    isDefault: true,
    versionId: "annex-iv-default-v1",
    versionIds: ["annex-iv-default-v1"],
  },
  {
    questionnaireId: "acme",
    name: "Acme AI policy",
    versionNumber: 3,
    questionCount: 18,
    isDefault: false,
    versionId: "acme-v3",
    versionIds: ["acme-v1", "acme-v2", "acme-v3"],
  },
];

const mount = (over: Record<string, unknown> = {}) =>
  render(
    <FormChooser
      project="mcas"
      options={options as never}
      preselected={{ param: "questionnaire", id: "acme" } as never}
      previous={null}
      {...(over as object)}
    />,
  );

const radios = () => screen.getAllByRole("radio") as HTMLInputElement[];
const labelOf = (r: HTMLInputElement) => r.closest("label")?.textContent ?? "";

describe("the chooser (R8, T36)", () => {
  it('T36 asks "Which questionnaire?" with one radio per option, name, version and question count', () => {
    mount();
    const group =
      screen.queryByRole("radiogroup", { name: "Which questionnaire?" }) ??
      screen.getByRole("group", { name: "Which questionnaire?" });
    expect(within(group).getAllByRole("radio")).toHaveLength(2);
    expect(group.textContent).toContain("Annex IV default");
    expect(group.textContent).toContain("Acme AI policy");
    expect(group.textContent).toContain("v3");
    expect(group.textContent).toContain("18 questions");
    expect(group.textContent).toContain("14 questions");
  });

  it("T36 R43 tags the Annex IV default and checks the preselected questionnaire", () => {
    mount();
    const acme = screen.getByRole("radio", {
      name: /Acme AI policy/,
    }) as HTMLInputElement;
    expect(acme.checked).toBe(true);
    const annex = screen.getByRole("radio", {
      name: /Annex IV default/,
    }) as HTMLInputElement;
    expect(labelOf(annex)).toMatch(/default\s*$/);
    expect(radios().filter((r) => r.checked)).toHaveLength(1);
  });

  it('T36 offers "+ New questionnaire" and "Import questionnaire" as links, and a "Continue" button', () => {
    mount();
    expect(
      screen
        .getByRole("link", { name: "+ New questionnaire" })
        .getAttribute("href"),
    ).toBe("/p/mcas/questionnaires/new");
    expect(
      screen
        .getByRole("link", { name: "Import questionnaire" })
        .getAttribute("href"),
    ).toBe("/p/mcas/questionnaires/import");
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /form/i })).toBeNull();
  });

  it("T36 Continue goes to the checked questionnaire", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(push).toHaveBeenCalledWith("/p/mcas/system/edit?questionnaire=acme");
  });

  it("T36 choosing another questionnaire and pressing Continue goes there instead", () => {
    mount();
    fireEvent.click(screen.getByRole("radio", { name: /Annex IV default/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(push).toHaveBeenCalledWith(
      "/p/mcas/system/edit?questionnaire=annex-iv-default",
    );
  });

  it("T36 the id in the URL is encoded", () => {
    mount({
      options: [
        {
          ...options[1],
          questionnaireId: "a b",
          versionId: "a b-v1",
          versionIds: ["a b-v1"],
        },
      ],
      preselected: { param: "questionnaire", id: "a b" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(push).toHaveBeenCalledWith(
      "/p/mcas/system/edit?questionnaire=a%20b",
    );
  });

  it('T36 an unknown questionnaire or version shows "That questionnaire was not found." in div.error', () => {
    const { container } = mount({ error: "That questionnaire was not found." });
    expect(container.querySelector("div.error")?.textContent).toBe(
      "That questionnaire was not found.",
    );
    expect(radios().some((r) => r.checked)).toBe(true);
  });
});

describe("the previous version and the newer one (T38)", () => {
  it('T38 P is the latest version of a listed questionnaire: its option carries "same as v4", no extra option', () => {
    mount({
      preselected: { param: "questionnaire", id: "annex-iv-default" },
      previous: {
        cardVersionNumber: 4,
        versionId: "annex-iv-default-v1",
        name: "Annex IV default",
        versionNumber: 1,
      },
    });
    expect(radios()).toHaveLength(2);
    const annex = screen.getByRole("radio", {
      name: /Annex IV default/,
    }) as HTMLInputElement;
    expect(annex.checked).toBe(true);
    expect(labelOf(annex)).toContain("same as v4");
    expect(screen.queryByText(/Same questionnaire as/)).toBeNull();
    expect(screen.queryByText("update available")).toBeNull();
  });

  it('T38 P is an older version of Q: a first option "Same questionnaire as v4 (<name> v<k>)", checked, and Q carries "update available"', () => {
    const { container } = mount({
      preselected: { param: "questionnaireVersion", id: "acme-v2" },
      previous: {
        cardVersionNumber: 4,
        versionId: "acme-v2",
        name: "Acme AI policy",
        versionNumber: 2,
      },
    });
    const all = radios();
    expect(all).toHaveLength(3);
    expect(all[0].checked).toBe(true);
    expect(all[0].value).toBe("questionnaireVersion:acme-v2");
    expect(labelOf(all[0])).toContain(
      "Same questionnaire as v4 (Acme AI policy v2)",
    );
    const acme = all.find((r) => r.value === "questionnaire:acme")!;
    const tags = [
      ...acme.closest("label")!.querySelectorAll("span.qf-tag"),
    ].map((t) => t.textContent?.trim());
    expect(tags).toContain("update available");
    expect(labelOf(acme)).not.toContain("same as v4");
    const annex = all.find(
      (r) => r.value === "questionnaire:annex-iv-default",
    )!;
    expect(labelOf(annex)).not.toContain("update available");
    expect(container.querySelectorAll("span.qf-tag")).toHaveLength(2); // default + update available
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(push).toHaveBeenCalledWith(
      "/p/mcas/system/edit?questionnaireVersion=acme-v2",
    );
  });

  it("T38 choosing the newer one instead goes to that questionnaire's latest", () => {
    mount({
      preselected: { param: "questionnaireVersion", id: "acme-v2" },
      previous: {
        cardVersionNumber: 4,
        versionId: "acme-v2",
        name: "Acme AI policy",
        versionNumber: 2,
      },
    });
    fireEvent.click(screen.getByRole("radio", { name: /^Acme AI policy/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(push).toHaveBeenCalledWith("/p/mcas/system/edit?questionnaire=acme");
  });

  it("T38 a use-once version (in no option) is offered again as the first option, checked", () => {
    mount({
      preselected: { param: "questionnaireVersion", id: "u1-v1" },
      previous: {
        cardVersionNumber: 2,
        versionId: "u1-v1",
        name: "Custom questions: MCAS, 2026-09-25",
        versionNumber: 1,
      },
    });
    const all = radios();
    expect(all).toHaveLength(3);
    expect(all[0].checked).toBe(true);
    expect(labelOf(all[0])).toContain(
      "Same questionnaire as v2 (Custom questions: MCAS, 2026-09-25 v1)",
    );
    expect(screen.queryByText("update available")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(push).toHaveBeenCalledWith(
      "/p/mcas/system/edit?questionnaireVersion=u1-v1",
    );
  });

  it("T38 D10 a retired questionnaire's version is offered again the same way", () => {
    mount({
      preselected: { param: "questionnaireVersion", id: "old-v3" },
      previous: {
        cardVersionNumber: 7,
        versionId: "old-v3",
        name: "Old policy",
        versionNumber: 3,
      },
    });
    const all = radios();
    expect(all).toHaveLength(3);
    expect(all[0].checked).toBe(true);
    expect(all[0].value).toBe("questionnaireVersion:old-v3");
    expect(labelOf(all[0])).toContain(
      "Same questionnaire as v7 (Old policy v3)",
    );
  });
});

describe("the edit page uses the chooser (R8, T36)", () => {
  const PAGE = "src/app/p/[project]/system/edit/page.tsx";

  it("T36 renders FormChooser when no questionnaire is named, and still QualifyForm once one is", () => {
    const page = readFileSync(PAGE, "utf8");
    expect(page).toMatch(/<FormChooser\b/);
    expect(page).toMatch(/<QualifyForm\b/);
  });

  it("T39 reads ?questionnaire, ?questionnaireVersion (and the old names) and ?example, and says when one is not found", () => {
    const page = readFileSync(PAGE, "utf8");
    expect(page).toMatch(/\bquestionnaireVersion\b/);
    expect(page).toMatch(/\bformVersion\b/);
    expect(page).toMatch(/\bexample\b/);
    expect(page).toContain("That questionnaire was not found.");
    expect(page).not.toContain("That form was not found.");
  });
});

describe("the default tag (R43)", () => {
  it('R43 the "default" tag (span.qf-tag " default") is on Annex IV default and on no other option', () => {
    mount({
      options: [
        ...options,
        {
          questionnaireId: "gov",
          name: "Governance",
          versionNumber: 1,
          questionCount: 4,
          isDefault: false,
          versionId: "gov-v1",
          versionIds: ["gov-v1"],
        },
      ],
    });
    const tagged = radios()
      .map((r) => r.closest("label")!)
      .filter((label) =>
        [...label.querySelectorAll("span.qf-tag")].some(
          (t) => t.textContent === " default",
        ),
      )
      .map((label) => label.querySelector(".qf-chooser-name")?.textContent);
    expect(tagged).toEqual(["Annex IV default"]);
  });
});
