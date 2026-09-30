import type { OntologyNode, OntologyView } from "./OntologyView";

/** How many nodes of the card carry a consistency note: the places it asks a person to check.
 *  Read from the card rather than from the agent's run, so the count survives a restart and
 *  drops a note a reviewer's edit settled. A node the card shows twice (the users are a row
 *  and a risk's stakeholder) counts once. */
export function placesToCheck(view: OntologyView): number {
  const nodes: Array<OntologyNode | null> = [view.system, ...view.rows.flatMap((r) => r.nodes)];
  for (const c of view.chains) {
    nodes.push(c.risk, c.source, c.vulnerability, c.consequence, c.impact, c.stakeholder, ...c.areas, c.control, c.followUp);
  }
  const noted = new Set<string>();
  for (const n of nodes) if (n && (n.flagNotes ?? []).length > 0) noted.add(n.id);
  return noted.size;
}
