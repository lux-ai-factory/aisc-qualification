import {
  findNode,
  type OntologyExtracted,
  type OntologyNode,
  type OntologyPatch,
  type OntologyView,
} from "./OntologyView";

/**
 * What the next card version takes from the card before it.
 *
 * A save of the form makes a new card, and the review done on the card before it
 * would otherwise stay there: the reviewer's corrections and the Refine with AI
 * draft. They come along where they still describe the same thing.
 *
 * A correction is keyed by node id, and node ids are positional (`risk0_control`):
 * remove the first risk and every other risk moves up one id. So a correction comes
 * along only when its node in the next card is the same item: the same AIRO class
 * and the same generated text. Anything else stays behind, on the version it was
 * made on, and is named in `left`.
 *
 * The draft is read from the whole card (the techniques answer, the names it gave
 * long answers by node id, the notes on the author's choices), so it comes along
 * only when nothing it was read from changed.
 */
export type ReviewCarry = {
  /** The next card's corrections; null for none. */
  patch: OntologyPatch | null;
  /** The next card's draft; null for none. */
  extracted: OntologyExtracted | null;
  /** The corrections that came along, by node id. */
  carried: string[];
  /** The corrections that stayed on the card before, by node id. */
  left: string[];
  draft: "carried" | "left" | "none";
};

/** What a card with no review carries. */
export const NO_REVIEW: ReviewCarry = Object.freeze({
  patch: null,
  extracted: null,
  carried: [],
  left: [],
  draft: "none",
}) as ReviewCarry;

export function carryReview({
  patch,
  extracted,
  before,
  after,
  sameContent,
}: {
  patch: OntologyPatch | null;
  extracted: OntologyExtracted | null;
  /** The card before, as it shows: its draft and corrections applied. */
  before: OntologyView;
  /** The next card as generated: its form, and the draft when it comes along; no corrections. */
  after: OntologyView;
  /** Whether everything the draft was read from is the same in the next card. */
  sameContent: boolean;
}): ReviewCarry {
  const carriedPatch: OntologyPatch = {};
  const carried: string[] = [];
  const left: string[] = [];
  for (const [id, change] of Object.entries(patch ?? {})) {
    const was = findNode(before, id);
    const now = findNode(after, id);
    if (was && now && sameItem(was, now)) {
      carriedPatch[id] = change;
      carried.push(id);
    } else {
      left.push(id);
    }
  }
  const draft = !extracted ? "none" : sameContent ? "carried" : "left";
  return {
    patch: carried.length ? carriedPatch : null,
    extracted: draft === "carried" ? extracted : null,
    carried,
    left,
    draft,
  };
}

/** The same item: the same class, and the same text before anyone renamed it. A long answer cut
 *  to a label is known by its full text, whatever name was drafted or given for it. */
function sameItem(was: OntologyNode, now: OntologyNode): boolean {
  const generated = (n: OntologyNode) => n.fullText ?? n.generatedLabel ?? n.label;
  return was.cls === now.cls && generated(was) === generated(now);
}
