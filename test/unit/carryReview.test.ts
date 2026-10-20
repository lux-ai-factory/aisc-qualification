import { describe, it, expect } from "vitest";
import { carryReview } from "@/domain/carryReview";
import type { OntologyNode, OntologyView } from "@/domain/OntologyView";

// What the next card version takes from the card before it: the reviewer's corrections
// where their item is the same item, and the Refine with AI draft when nothing it was
// read from has changed. Node ids are positional (`risk0_control`), so an id alone
// does not say it is the same item: removing the first risk moves every other one up.

function node(id: string, over: Partial<OntologyNode> = {}): OntologyNode {
  return {
    id,
    label: `label of ${id}`,
    cls: "Risk",
    vair: null,
    fullText: null,
    provenance: "form",
    ...over,
  };
}

function view(nodes: OntologyNode[]): OntologyView {
  const [system, ...rest] = nodes;
  return {
    system,
    answers: [],
    rows: [{ property: "p", label: "p", citation: "c", nodes: rest }],
    chains: [],
    counts: {
      nodes: nodes.length,
      triples: 0,
      risks: 0,
      reviewed: 0,
      untyped: 0,
      needsTerm: 0,
      flagged: 0,
      unclassifiable: 0,
    },
  } as OntologyView;
}

const SYSTEM = node("system", { cls: "AISystem", label: "MCAS" });
const draft = { techniques: ["gradient boosting"] };

describe("carrying a card's review into its next version", () => {
  it("a correction on the same item comes along", () => {
    const carry = carryReview({
      patch: { risk0: { vair: "Bias" } },
      extracted: null,
      before: view([SYSTEM, node("risk0", { label: "Unfair scores" })]),
      after: view([SYSTEM, node("risk0", { label: "Unfair scores" })]),
      sameContent: false,
    });
    expect(carry.patch).toEqual({ risk0: { vair: "Bias" } });
    expect(carry.carried).toEqual(["risk0"]);
    expect(carry.left).toEqual([]);
  });

  it("an item that moved to another place keeps nothing of the one now there", () => {
    // v3 had two risks and the reviewer corrected the first; v4 removed it, so the
    // second risk is risk0 now.
    const carry = carryReview({
      patch: { risk0: { vair: "Bias" } },
      extracted: null,
      before: view([
        SYSTEM,
        node("risk0", { label: "Unfair scores" }),
        node("risk1", { label: "Data leak" }),
      ]),
      after: view([SYSTEM, node("risk0", { label: "Data leak" })]),
      sameContent: false,
    });
    expect(carry.patch).toBeNull();
    expect(carry.left).toEqual(["risk0"]);
  });

  it("an item that is gone, or is now of another class, leaves its correction behind", () => {
    const carry = carryReview({
      patch: { risk1: { note: "checked" }, purpose: { vair: "Scoring" } },
      extracted: null,
      before: view([
        SYSTEM,
        node("risk1"),
        node("purpose", { cls: "Purpose", label: "Scoring" }),
      ]),
      after: view([SYSTEM, node("purpose", { cls: "Capability", label: "Scoring" })]),
      sameContent: false,
    });
    expect(carry.patch).toBeNull();
    expect(carry.left.sort()).toEqual(["purpose", "risk1"]);
  });

  it("a relabelled item is recognised by the label it was generated with", () => {
    const carry = carryReview({
      patch: { risk0: { label: "Unfair credit scores" } },
      extracted: null,
      before: view([
        SYSTEM,
        node("risk0", {
          label: "Unfair credit scores",
          generatedLabel: "Unfair scores",
          provenance: "reviewed",
        }),
      ]),
      after: view([SYSTEM, node("risk0", { label: "Unfair scores" })]),
      sameContent: false,
    });
    expect(carry.carried).toEqual(["risk0"]);
  });

  it("an answer cut to a label is recognised by its full text, whatever name it was given", () => {
    const long = "A long answer about how the model was trained, cut to a label.";
    const carry = carryReview({
      patch: { technique0: { vair: "MachineLearning" } },
      extracted: draft,
      before: view([
        SYSTEM,
        node("technique0", { label: "Model training", fullText: long, nameDrafted: true }),
      ]),
      after: view([SYSTEM, node("technique0", { label: "A long answer about…", fullText: long })]),
      sameContent: false,
    });
    expect(carry.carried).toEqual(["technique0"]);
  });

  it("the draft comes along only when nothing it was read from changed", () => {
    const base = {
      patch: null,
      extracted: draft,
      before: view([SYSTEM]),
      after: view([SYSTEM]),
    };
    expect(carryReview({ ...base, sameContent: true })).toMatchObject({
      extracted: draft,
      draft: "carried",
    });
    expect(carryReview({ ...base, sameContent: false })).toMatchObject({
      extracted: null,
      draft: "left",
    });
    expect(carryReview({ ...base, extracted: null, sameContent: true })).toMatchObject({
      extracted: null,
      draft: "none",
    });
  });

  it("a card with no review carries nothing", () => {
    expect(
      carryReview({
        patch: {},
        extracted: null,
        before: view([SYSTEM]),
        after: view([SYSTEM]),
        sameContent: true,
      }),
    ).toEqual({ patch: null, extracted: null, carried: [], left: [], draft: "none" });
  });
});
