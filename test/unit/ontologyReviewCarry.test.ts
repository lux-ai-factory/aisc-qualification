import { describe, it, expect, vi } from "vitest";
import { OntologyService } from "@/server/services/OntologyService";
import { OntologyRejected } from "@/server/services/OntologyClient";

// reviewToCarry: the builder judges what the next card version takes from the card before it.
// The card before is built as it shows (its draft and corrections), the next card as generated
// (its own export; the draft only when nothing it was read from changed), and the corrections
// that come along are built once more on the next card, so a set the builder refuses is never
// stored. Which corrections come along is domain/carryReview's rule (carryReview.test.ts).

vi.mock("@/server/services/QualificationExporter", () => ({
  toExport: (q: { id: string; content: string }) => ({ id: q.id, content: q.content }),
}));

const node = (id: string, label: string) => ({
  id,
  label,
  cls: "Risk",
  vair: null,
  fullText: null,
  provenance: "form",
});
const viewOf = (risks: string[]) => ({
  system: { ...node("system", "MCAS"), cls: "AISystem" },
  answers: [],
  rows: [{ property: "p", label: "p", citation: "c", nodes: risks.map((r, i) => node(`risk${i}`, r)) }],
  chains: [],
  counts: {},
});

const draft = { techniques: ["boosting"] };

function setup(before: { content: string; risks: string[] }, nextRisks: string[]) {
  const client = {
    build: vi.fn(async (q: { id: string }) => ({
      view: viewOf(q.id === "card-3" ? before.risks : nextRisks),
      turtle: "",
      jsonld: "",
      problems: [],
      digest: "",
    })),
  };
  const svc = new OntologyService(
    (async () => ({})) as never,
    () => client as never,
    (() => ({})) as never,
    (async () => ({ resolve: async () => null })) as never,
  );
  const from = {
    id: "card-3",
    content: before.content,
    questionnaireVersionId: null,
    ontologyPatch: { risk0: { vair: "Bias" }, risk1: { note: "checked" } },
    ontologyExtracted: draft,
  };
  return { svc, client, from };
}

describe("what the next card version takes from the card before it", () => {
  it("builds the card before as it shows, the next as generated, then the corrections that come along", async () => {
    const { svc, client, from } = setup(
      { content: "v3 answers", risks: ["Unfair scores", "Data leak"] },
      ["Unfair scores"],
    );
    const next = { id: "pending", content: "v4 answers" };
    const carry = await svc.reviewToCarry("mcas", from as never, next as never);

    expect(client.build.mock.calls).toEqual([
      [{ id: "card-3", content: "v3 answers" }, draft, from.ontologyPatch],
      [next, undefined, undefined],
      [next, undefined, { risk0: { vair: "Bias" } }],
    ]);
    expect(carry).toEqual({
      patch: { risk0: { vair: "Bias" } },
      extracted: null,
      carried: ["risk0"],
      left: ["risk1"],
      draft: "left",
    });
  });

  it("the same content, whatever the card's id: the next card is generated with the draft, and keeps it", async () => {
    const { svc, client, from } = setup(
      { content: "same answers", risks: ["Unfair scores", "Data leak"] },
      ["Unfair scores", "Data leak"],
    );
    const next = { id: "pending", content: "same answers" };
    const carry = await svc.reviewToCarry("mcas", from as never, next as never);
    expect(client.build.mock.calls[1]).toEqual([next, draft, undefined]);
    expect(client.build.mock.calls[2]).toEqual([next, draft, from.ontologyPatch]);
    expect(carry).toMatchObject({ extracted: draft, draft: "carried", left: [] });
  });

  it("a card with no review builds nothing and carries nothing", async () => {
    const { svc, client, from } = setup({ content: "a", risks: [] }, []);
    const carry = await svc.reviewToCarry(
      "mcas",
      { ...from, ontologyPatch: null, ontologyExtracted: null } as never,
      { id: "pending", content: "b" } as never,
    );
    expect(client.build).not.toHaveBeenCalled();
    expect(carry).toEqual({ patch: null, extracted: null, carried: [], left: [], draft: "none" });
  });

  it("corrections the builder refuses on the next card are not carried: the refusal goes to the caller", async () => {
    const { svc, client, from } = setup(
      { content: "a", risks: ["Unfair scores"] },
      ["Unfair scores"],
    );
    client.build
      .mockImplementationOnce(async () => ({ view: viewOf(["Unfair scores"]) }) as never)
      .mockImplementationOnce(async () => ({ view: viewOf(["Unfair scores"]) }) as never)
      .mockRejectedValueOnce(new OntologyRejected("'Bias' is not a term VAIR defines"));
    await expect(
      svc.reviewToCarry("mcas", from as never, { id: "pending", content: "b" } as never),
    ).rejects.toBeInstanceOf(OntologyRejected);
  });
});
