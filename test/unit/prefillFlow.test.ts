import { describe, it, expect, vi } from "vitest";
import { applyDocument, checkDocument, type Reader } from "@/lib/prefillFlow";
import type { RiskExample } from "@/data/examples";

// The upload in three steps: choosing a file reads it at once, a file that
// cannot be read says so, and a file that can asks what to do before anything
// on the form changes. The reading and the merge stay in the prefill service;
// this only decides which step comes next.
const file = new File(["System name: MCAS\n"], "doc.md");

const row = (risk: string): RiskExample => ({
  risk,
  source: "",
  vulnerability: "",
  consequence: "",
  affected: "",
  areas: [],
  control: "",
  followUpControl: "",
});

const ok = (
  values: Record<string, string>,
  filled: string[],
  kept: string[] = [],
  risks: { risks?: RiskExample[] | null; risksKept?: boolean; risksProposed?: number } = {},
) =>
  vi.fn<Reader>().mockResolvedValue({
    ok: true,
    values,
    filled,
    kept,
    model: null,
    risks: risks.risks ?? null,
    risksKept: risks.risksKept ?? false,
    risksProposed: risks.risksProposed ?? risks.risks?.length ?? 0,
  });

describe("checking a document as soon as it is chosen", () => {
  it("says what was wrong with a file it could not read", async () => {
    const read = vi.fn<Reader>().mockResolvedValue({ ok: false, error: "exe is not a format this reads" });
    expect(await checkDocument(file, {}, [], read)).toEqual({
      kind: "error",
      error: "exe is not a format this reads",
    });
  });

  it("says so when nothing in the document fits the form", async () => {
    expect(await checkDocument(file, { systemName: "typed" }, [], ok({ systemName: "typed" }, []))).toEqual({
      kind: "nothing",
    });
  });

  it("asks what to do when the form already has answers, and changes nothing yet", async () => {
    const read = ok({ systemName: "typed", company: "Creditum" }, ["company"], ["systemName"]);
    expect(await checkDocument(file, { systemName: "typed", company: "" }, [], read)).toEqual({
      kind: "choose",
      answered: 1,
      proposed: 2,
      risksAnswered: 0,
      risksProposed: 0,
    });
  });

  it("reads with the careful choice, so a check can never be what overwrites", async () => {
    const read = ok({ company: "Creditum" }, ["company"]);
    await checkDocument(file, { systemName: "typed" }, [row("mine")], read);
    expect(read).toHaveBeenCalledWith(file, "empty", { systemName: "typed" }, [row("mine")]);
  });

  it("applies straight away on an empty form, where both choices are the same", async () => {
    const read = ok({ company: "Creditum" }, ["company"], [], { risks: [row("doc")] });
    expect(await checkDocument(file, { systemName: " ", company: "" }, [row(" ")], read)).toEqual({
      kind: "apply",
      values: { company: "Creditum" },
      filled: ["company"],
      kept: [],
      risks: [row("doc")],
      risksKept: false,
    });
  });

  it("counts a document with only risks as something to use", async () => {
    const read = ok({}, [], [], { risks: [row("doc")] });
    expect((await checkDocument(file, {}, [], read)).kind).toBe("apply");
  });

  it("asks when the only thing on the form is a risk somebody wrote", async () => {
    const read = ok({ company: "Creditum" }, ["company"], [], { risksKept: true, risksProposed: 3 });
    expect(await checkDocument(file, {}, [row("mine")], read)).toEqual({
      kind: "choose",
      answered: 0,
      proposed: 1,
      risksAnswered: 1,
      risksProposed: 3,
    });
  });
});

describe("applying the choice", () => {
  it("sends the choice the person pressed, with the rows the form holds", async () => {
    const read = ok({ systemName: "MCAS" }, ["systemName"]);
    await applyDocument(file, "replace", { systemName: "typed" }, [row("mine")], read);
    expect(read).toHaveBeenCalledWith(file, "replace", { systemName: "typed" }, [row("mine")]);
  });

  it("hands back what to write onto the form, risks included", async () => {
    const read = ok({ systemName: "typed", company: "Creditum" }, ["company"], ["systemName"], {
      risks: [row("doc")],
    });
    expect(await applyDocument(file, "replace", { systemName: "typed" }, [], read)).toEqual({
      kind: "apply",
      values: { systemName: "typed", company: "Creditum" },
      filled: ["company"],
      kept: ["systemName"],
      risks: [row("doc")],
      risksKept: false,
    });
  });

  it("reports a reader that failed in between", async () => {
    const read = vi.fn<Reader>().mockResolvedValue({ ok: false, error: "The document reader could not be reached." });
    expect(await applyDocument(file, "empty", {}, [], read)).toEqual({
      kind: "error",
      error: "The document reader could not be reached.",
    });
  });
});
