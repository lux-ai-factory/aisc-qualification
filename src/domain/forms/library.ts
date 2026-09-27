// The questionnaire builder's left column: search over the question sets, the
// "overlaps" hint for questions that answer the same Annex IV point, and "Update
// available" for picks whose set has a newer wording. Pure and deterministic.
import { annexCitation, type AnnexPointId } from "./annexPoints";
import type { BuilderRow } from "./builderState";
import type { ResolvedQuestion } from "./types";

/** One question set's latest version, as the builder's left column shows it. */
export type SetGroup = {
  setId: string;
  setName: string;
  /** The version these questions are worded in: what a tick pins to (R62). */
  versionId: string;
  versionNumber: number;
  /** Retired sets are not offered as chips, but still count for "Update available". */
  retired: boolean;
  questions: ResolvedQuestion[];
};

/** What "Update available" offers for one picked row (T26). */
export type SetUpdate =
  | { kind: "reworded"; question: ResolvedQuestion; versionId: string; versionNumber: number }
  | { kind: "removed"; setName: string; versionNumber: number };

/**
 * Lowercase; every character that is not a letter, a digit or § becomes a
 * space; whitespace collapsed. So "Annex IV(2)(a)" and "annex iv 2 a" match,
 * and a query of punctuation only is the empty query.
 */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}§]+/gu, " ")
    .trim();
}

/** Groups with at least one question whose text or citation holds the query; order kept. */
export function filterLibrary<G extends { questions: ResolvedQuestion[] }>(groups: G[], query: string): G[] {
  const q = normalise(query);
  if (q === "") return groups;
  return groups
    .map((g) => ({
      ...g,
      questions: g.questions.filter(
        (x) => normalise(x.text).includes(q) || normalise(x.citation).includes(q),
      ),
    }))
    .filter((g) => g.questions.length > 0);
}

type Tagged = Pick<ResolvedQuestion, "questionId" | "annexPoint">;

/**
 * questionId -> point, for every selected or candidate question tagged with a
 * point that another selected question (another id) also answers.
 */
export function overlapHints(
  selected: Tagged[],
  candidates: Tagged[],
): Record<string, AnnexPointId> {
  const hints: Record<string, AnnexPointId> = {};
  for (const q of [...selected, ...candidates]) {
    const p = q.annexPoint;
    if (p === null) continue;
    if (selected.some((s) => s.questionId !== q.questionId && s.annexPoint === p)) {
      hints[q.questionId] = p;
    }
  }
  return hints;
}

export function overlapLabel(point: AnnexPointId): string {
  return `≈ overlaps ${annexCitation(point)}`;
}

const WORDING_FIELDS = ["text", "citation", "required", "annexPoint", "groupLabel"] as const;

/**
 * Row index -> the update its set offers, for every pick whose set (the pick's
 * source setId) is among `groups` and whose latest version is not the pinned one:
 * "reworded" when that version words the question differently in any of the five
 * wording fields, "removed" when it no longer has the question. The same wording
 * in a newer version is no update: a pin is never bumped silently (D13). Pure.
 */
export function updatesAvailable(rows: BuilderRow[], groups: SetGroup[]): Record<number, SetUpdate> {
  const updates: Record<number, SetUpdate> = {};
  rows.forEach((row, i) => {
    if (row.kind !== "pick") return;
    const group = groups.find((g) => g.setId === row.source.setId);
    if (!group || group.versionId === row.setVersionId) return;
    const latest = group.questions.find((q) => q.questionId === row.questionId);
    if (!latest) {
      updates[i] = { kind: "removed", setName: group.setName, versionNumber: group.versionNumber };
      return;
    }
    if (WORDING_FIELDS.some((f) => latest[f] !== row.source[f])) {
      updates[i] = { kind: "reworded", question: latest, versionId: group.versionId, versionNumber: group.versionNumber };
    }
  });
  return updates;
}
