import { describe, it, expect } from "vitest";
import * as chooser from "@/domain/forms/chooser";

// "Which questionnaire?": which option the chooser opens with, and which URL parameter the edit
// page looks up.
//
// Two-level forms (docs/superpowers/two-level-forms-2026-09-25/01-spec.md, T37, T39; spec 8.3
// formChooser row). Changed deliberately:
//   - preselect's signature: options are { questionnaireId, versionId /* its latest */ }, from is
//     { fromVersionId }. ChooserPick is { param: "questionnaire" | "questionnaireVersion", id }.
//   - R8 "an older version of a form still starts on that form (its latest version)" flips (D11):
//     a card never moves to a newer version by itself, so an older version starts on that exact
//     version.
//   - pickFormParams is renamed pickQuestionnaireParams and extended with the new parameter
//     names; ?form and ?formVersion stay as aliases (D20). The lookups are
//     { lookup: "example" } | { lookup: "version", id } | { lookup: "latest", id } | { lookup: "none" }.
// Kept: the first card starts on the Annex IV default whatever the options' order; the first
// option without it; null without options; a stale extra argument changes nothing.

type Pick = { param: string; id: string } | null;
const preselect = (options: unknown[], from: unknown): Pick =>
  (chooser as unknown as { preselect: (o: unknown, f: unknown) => Pick }).preselect(options, from);

const options = [
  { questionnaireId: "annex-iv-default", versionId: "annex-iv-default-v1" },
  { questionnaireId: "acme", versionId: "acme-v3" },
  { questionnaireId: "gov", versionId: "gov-v1" },
];

describe("preselect (T37)", () => {
  it("T37 a project's first card starts on the Annex IV default", () => {
    expect(preselect(options, { fromVersionId: null })).toEqual({ param: "questionnaire", id: "annex-iv-default" });
  });

  it("T37 the first card gets annex-iv-default whatever the order of the options", () => {
    expect(preselect([...options].reverse(), { fromVersionId: null })).toEqual({
      param: "questionnaire",
      id: "annex-iv-default",
    });
  });

  it("T37 without the default among the options, a first card gets the first option; no options, null", () => {
    const without = options.filter((o) => o.questionnaireId !== "annex-iv-default");
    expect(preselect(without, { fromVersionId: null })).toEqual({ param: "questionnaire", id: "acme" });
    expect(preselect([], { fromVersionId: null })).toBeNull();
  });

  it("T37 A14 a card filled with the latest version of a listed questionnaire starts on that questionnaire", () => {
    expect(preselect(options, { fromVersionId: "gov-v1" })).toEqual({ param: "questionnaire", id: "gov" });
    expect(preselect(options, { fromVersionId: "acme-v3" })).toEqual({ param: "questionnaire", id: "acme" });
  });

  it("T37 D11 a card filled with an older version starts on that exact version, never the newer one", () => {
    expect(preselect(options, { fromVersionId: "acme-v1" })).toEqual({ param: "questionnaireVersion", id: "acme-v1" });
  });

  it("T37 a card filled with a use-once version, or a retired questionnaire's version, is offered that very version", () => {
    expect(preselect(options, { fromVersionId: "u1-v1" })).toEqual({ param: "questionnaireVersion", id: "u1-v1" });
    expect(preselect(options, { fromVersionId: "retired-v2" })).toEqual({
      param: "questionnaireVersion",
      id: "retired-v2",
    });
  });

  it("T37 a legacy card has P = annex-iv-default-v1, the default's latest, so it starts on the default", () => {
    expect(preselect([...options].reverse(), { fromVersionId: "annex-iv-default-v1" })).toEqual({
      param: "questionnaire",
      id: "annex-iv-default",
    });
  });

  it("T37 a stale argument an old caller passes changes nothing", () => {
    expect(
      preselect(options, { fromVersionId: null, fromFormListed: true, defaultFormId: "acme" }),
    ).toEqual({ param: "questionnaire", id: "annex-iv-default" });
  });
});

// pickQuestionnaireParams({ example, questionnaire, questionnaireVersion, form, formVersion }):
//   a known ?example                      { lookup: "example" }
//   else ?questionnaireVersion            { lookup: "version", id }
//   else ?formVersion (alias)             { lookup: "version", id }
//   else ?questionnaire                   { lookup: "latest", id }
//   else ?form (alias)                    { lookup: "latest", id }
//   else                                  { lookup: "none" }
// Empty strings count as absent. An unknown version never falls back to a questionnaire
// parameter: the lookup names the version, and the page shows T36's message when it is not found.

describe("pickQuestionnaireParams (T39)", () => {
  const pick = (params: Record<string, string | undefined>) =>
    (chooser as unknown as { pickQuestionnaireParams: (p: unknown) => unknown }).pickQuestionnaireParams(params);

  it("T39 is exported by src/domain/forms/chooser.ts, and pickFormParams is gone", () => {
    expect(typeof (chooser as Record<string, unknown>).pickQuestionnaireParams).toBe("function");
    expect((chooser as Record<string, unknown>).pickFormParams).toBeUndefined();
  });

  it.each([
    [{ example: "mcas" }],
    [{ example: "mcas", questionnaireVersion: "u1-v1" }],
    [{ example: "MCAS", questionnaire: "acme", formVersion: "u1-v1", form: "gov" }],
  ])("T39 row 1: a known ?example wins over everything (%o)", (params) => {
    expect(pick(params)).toEqual({ lookup: "example" });
  });

  it.each([
    [{ questionnaireVersion: "u1-v1" }],
    [{ questionnaireVersion: "u1-v1", questionnaire: "acme" }],
    [{ questionnaireVersion: "u1-v1", formVersion: "old-v1", form: "gov" }],
    [{ questionnaireVersion: "u1-v1", questionnaire: "gone" }],
    [{ example: "nope", questionnaireVersion: "u1-v1", questionnaire: "acme" }],
    [{ example: "", questionnaireVersion: "u1-v1" }],
  ])("T39 row 2: ?questionnaireVersion is the lookup; nothing else is read (%o)", (params) => {
    expect(pick(params)).toEqual({ lookup: "version", id: "u1-v1" });
  });

  it.each([
    [{ formVersion: "u1-v1" }],
    [{ formVersion: "u1-v1", questionnaire: "acme" }],
    [{ formVersion: "u1-v1", form: "acme" }],
    [{ questionnaireVersion: "", formVersion: "u1-v1", questionnaire: "acme" }],
  ])("T39 row 3: the alias ?formVersion comes next, and still beats any questionnaire parameter (%o)", (params) => {
    expect(pick(params)).toEqual({ lookup: "version", id: "u1-v1" });
  });

  it.each([
    [{ questionnaire: "acme" }],
    [{ questionnaire: "acme", form: "gov" }],
    [{ questionnaire: "acme", questionnaireVersion: "", formVersion: "" }],
    [{ example: "nope", questionnaire: "acme" }],
  ])("T39 row 4: no version parameter, ?questionnaire is the lookup of its latest version (%o)", (params) => {
    expect(pick(params)).toEqual({ lookup: "latest", id: "acme" });
  });

  it.each([[{ form: "acme" }], [{ form: "acme", questionnaire: "" }], [{ form: "acme", formVersion: "" }]])(
    "T39 row 5: the alias ?form comes last (%o)",
    (params) => {
      expect(pick(params)).toEqual({ lookup: "latest", id: "acme" });
    },
  );

  it.each([
    [{}],
    [{ questionnaire: "", questionnaireVersion: "", form: "", formVersion: "" }],
    [{ example: "nope" }],
    [{ example: "" }],
  ])("T39 row 6: nothing named is the chooser, no lookup (%o)", (params) => {
    expect(pick(params)).toEqual({ lookup: "none" });
  });

  it("T39 an unknown version never falls back to a questionnaire parameter", () => {
    expect(pick({ questionnaireVersion: "no-such-version", questionnaire: "acme" })).toEqual({
      lookup: "version",
      id: "no-such-version",
    });
    expect(pick({ formVersion: "no-such-version", form: "acme" })).toEqual({ lookup: "version", id: "no-such-version" });
  });
});
