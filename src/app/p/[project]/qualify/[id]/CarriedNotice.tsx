import Link from "next/link";
import type { CarriedReview } from "@/server/services/QualificationService";

// What this card version took from the review of the card before it (its review_carried history
// row): the corrections whose item is the same item here, and the draft of AI suggestions when what
// it was read from did not change. What stayed behind is named with a link to the version it is
// still on, so a save of the form never drops a review unseen.

const corrections = (n: number) => `${n} correction${n === 1 ? "" : "s"}`;

export default function CarriedNotice({
  review,
  fromHref,
}: {
  review: CarriedReview;
  /** The card before, where whatever stayed behind still is. */
  fromHref: string;
}) {
  const v = `v${review.from_version ?? "?"}`;
  const before = <Link href={fromHref}>{v}</Link>;

  if (review.failed !== undefined) {
    const what = [
      review.left.length ? `its ${corrections(review.left.length)}` : null,
      review.draft === "left" ? "its draft of AI suggestions" : null,
    ].filter(Boolean);
    if (!what.length) return null;
    return (
      <div className="qf-prefilled" role="status">
        <p>
          The review of {v} could not be carried to this version: {what.join(" and ")}{" "}
          {what.length > 1 || review.left.length > 1 ? "are" : "is"} still on {before}.
        </p>
      </div>
    );
  }

  const came = [
    review.carried.length ? corrections(review.carried.length) : null,
    review.draft === "carried" ? "the draft of AI suggestions" : null,
  ].filter(Boolean);
  const lines = [
    came.length ? <p key="came">Carried from {v}: {came.join(" and ")}.</p> : null,
    review.left.length ? (
      <p key="left">
        {corrections(review.left.length)} stayed on {before}:{" "}
        {review.left.length === 1 ? "its item is" : "their items are"} not the same in this
        version.
      </p>
    ) : null,
    review.draft === "left" ? (
      <p key="draft">
        The draft of AI suggestions stayed on {review.left.length ? v : before}: what it was read
        from changed. Let AI suggest additions again for this version.
      </p>
    ) : null,
  ].filter(Boolean);
  if (!lines.length) return null;
  return (
    <div className="qf-prefilled" role="status">
      {lines}
    </div>
  );
}
