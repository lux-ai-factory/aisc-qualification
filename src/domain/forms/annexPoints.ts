// The 14 Annex IV points a question may answer. One file, src/data/annexPoints.json,
// read here and by services/ontology (airo_min/annex_points.py). The ids are the
// default form's question ids, so a seeded question's point is its own id.
import data from "@/data/annexPoints.json";

export type AnnexPointId =
  | "1a"
  | "1b"
  | "1c"
  | "1de"
  | "1f"
  | "1gh"
  | "2a"
  | "2b"
  | "2c"
  | "2d"
  | "2e"
  | "2f"
  | "2g"
  | "2h";

export const ANNEX_POINTS: { id: AnnexPointId; citation: string }[] =
  data.points as { id: AnnexPointId; citation: string }[];

const CITATIONS = new Map<string, string>(
  ANNEX_POINTS.map((p) => [p.id, p.citation]),
);

/** Exact and case-sensitive: "1A" and "Annex IV(1)(a)" are not points. */
export function isAnnexPoint(s: unknown): s is AnnexPointId {
  return typeof s === "string" && CITATIONS.has(s);
}

export function annexCitation(id: AnnexPointId): string {
  const citation = CITATIONS.get(id);
  if (citation === undefined) throw new Error(`${id} is not an Annex IV point`);
  return citation;
}
