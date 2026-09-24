import { describe, it, expect } from "vitest";
import { answeredFields, needsAChoice, currentAnswers, currentRisks } from "@/lib/prefillChoice";

// Uploading onto an empty form just fills it. Uploading onto a form somebody
// has been typing into is the case that needs asking about, so the question is
// only put when there is something to lose.
describe("whether to ask what to do with what is already there", () => {
  it("an empty form is filled without asking", () => {
    expect(needsAChoice({})).toBe(false);
    expect(needsAChoice({ systemName: "", company: "   " })).toBe(false);
  });

  it("a form with one answer in it is asked about", () => {
    expect(needsAChoice({ systemName: "MCAS" })).toBe(true);
  });

  it("it says which fields are at stake", () => {
    expect(answeredFields({ systemName: "MCAS", company: "", "q:annex-1:1a": "x" })).toEqual([
      "q:annex-1:1a",
      "systemName",
    ]);
  });
});

describe("what the form currently holds", () => {
  function formWith(entries: [string, string][]) {
    const fd = new FormData();
    for (const [k, v] of entries) fd.append(k, v);
    return fd;
  }

  it("reads the metadata and the answers", () => {
    const found = currentAnswers(formWith([["systemName", "MCAS"], ["q:annex-1:1a", "First release."]]));
    expect(found).toEqual({ systemName: "MCAS", "q:annex-1:1a": "First release." });
  });

  it("leaves out the things a document does not propose", () => {
    // Tag pickers and risk rows are chosen, not written, and the reader says
    // nothing about them. Sending them would only invite them to be replaced.
    const found = currentAnswers(
      formWith([
        ["systemName", "MCAS"],
        ["sectorTags", "finance"],
        ["risk:0:name", "Bias"],
        ["intent", "save"],
      ]),
    );
    expect(found).toEqual({ systemName: "MCAS" });
  });

  it("ignores a file that happens to be in the same form", () => {
    const fd = formWith([["systemName", "MCAS"]]);
    fd.append("file", new File(["x"], "doc.txt"));
    expect(currentAnswers(fd)).toEqual({ systemName: "MCAS" });
  });
});

describe("the risk rows the form holds now", () => {
  it("reads each row by its key, with the areas it has chosen", () => {
    const form = new FormData();
    form.set("risk:0:risk", "wrongly refused");
    form.set("risk:0:affected", "user");
    form.append("risk:0:area", "right");
    form.append("risk:0:area", "safety");
    form.set("risk:3:risk", "drift");
    form.set("systemName", "not a risk");
    const rows = currentRisks(form);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ risk: "wrongly refused", affected: "user", areas: ["right", "safety"], control: "" });
    expect(rows[1].risk).toBe("drift");
  });

  it("is empty when there are no rows", () => {
    expect(currentRisks(new FormData())).toEqual([]);
  });
});
