import { describe, it, expect } from "vitest";
import { parseExtracted } from "@/server/forms/ExtractedParser";

const valid = {
  techniques: [
    { label: "Gradient-boosted decision tree", vair: "MachineLearning" },
    { label: "Policy eligibility rules", vair: null },
  ],
  components: [{ label: "Scoring model", vair: "Model" }],
  names: { risk0_source: "Postcode proxies" },
  types: { risk0_control: "ManualControl" },
  flags: { technique1: ["ungrounded"] },
};

describe("the payload a filler agent publishes", () => {
  it("accepts a draft with its flags", () => {
    const result = parseExtracted(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.techniques?.[0].vair).toBe("MachineLearning");
    expect(result.value.flags?.technique1).toEqual(["ungrounded"]);
  });

  it("accepts a drafted name with the text it was written for", () => {
    const names = { purpose: { name: "Consumer loan scoring", of: "Assess the creditworthiness of consumer loan applicants" }, risk0_source: "Postcode proxies" };
    const result = parseExtracted({ ...valid, names });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.names).toEqual(names);
  });

  it("refuses a drafted name longer than a name, or without its text", () => {
    expect(parseExtracted({ names: { purpose: { name: "x".repeat(61), of: "t" } } }).ok).toBe(false);
    expect(parseExtracted({ names: { purpose: { name: "Scoring" } } }).ok).toBe(false);
    expect(parseExtracted({ names: { purpose: { name: "Scoring", of: "t", extra: 1 } } }).ok).toBe(false);
  });

  it("accepts an empty draft", () => {
    expect(parseExtracted({ techniques: [], components: [] }).ok).toBe(true);
  });

  it("refuses a flag the graph cannot carry", () => {
    const result = parseExtracted({ ...valid, flags: { technique1: ["smells-wrong"] } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/flag/i);
  });

  it("refuses a label longer than a name", () => {
    const result = parseExtracted({
      techniques: [{ label: "x".repeat(61), vair: null }],
    });
    expect(result.ok).toBe(false);
  });

  it("refuses a node with no label", () => {
    expect(parseExtracted({ techniques: [{ vair: "MachineLearning" }] }).ok).toBe(
      false,
    );
  });

  it("refuses anything it was not expecting, rather than storing it", () => {
    // The column is read straight back into the builder, so an unknown key is
    // a silent no-op at best and a surprise at worst.
    const result = parseExtracted({ ...valid, notes: "hello" });
    expect(result.ok).toBe(false);
  });

  it("refuses a payload that is not an object", () => {
    expect(parseExtracted("techniques").ok).toBe(false);
    expect(parseExtracted(null).ok).toBe(false);
  });

  it("keeps the vair term optional but never blank", () => {
    expect(parseExtracted({ techniques: [{ label: "A", vair: "" }] }).ok).toBe(false);
    expect(parseExtracted({ techniques: [{ label: "A" }] }).ok).toBe(true);
  });
});
