import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { placesToCheck } from "@/domain/placesToCheck";
import type { OntologyNode, OntologyView } from "@/domain/OntologyView";

// The ontology builder's own view of the MCAS example (kept current by the ontology suite).
const MCAS: OntologyView = JSON.parse(
  readFileSync(resolve(__dirname, "../../services/agents/tests/fixtures/mcas.view.json"), "utf-8"),
);
const NOTE = [{ why: "the answer says otherwise", quote: "a quote" }];

function noted(view: OntologyView, ids: string[]): OntologyView {
  const mark = (n: OntologyNode | null): OntologyNode | null =>
    n && ids.includes(n.id) ? { ...n, flagNotes: NOTE } : n;
  return {
    ...view,
    system: mark(view.system)!,
    rows: view.rows.map((r) => ({ ...r, nodes: r.nodes.map((n) => mark(n)!) })),
    chains: view.chains.map((c) => ({
      ...c,
      risk: mark(c.risk)!,
      source: mark(c.source),
      stakeholder: mark(c.stakeholder),
      areas: c.areas.map((a) => mark(a)!),
    })),
  };
}

describe("the places a card asks a person to check", () => {
  it("are none on a card without notes", () => {
    expect(placesToCheck(MCAS)).toBe(0);
  });

  it("are the noted nodes of the rows, the system and the risk chains", () => {
    expect(placesToCheck(noted(MCAS, ["system", "purpose", "risk0_source", "area_Right"]))).toBe(4);
  });

  it("count a node the card shows in several places once", () => {
    // the users are a row and the stakeholder of three risks
    expect(placesToCheck(noted(MCAS, ["users"]))).toBe(1);
  });
});
