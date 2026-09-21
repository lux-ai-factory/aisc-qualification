"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Shown while a submitted qualification is being turned into an AI card.
//
// The stages are the work saving sets off: the answers are validated and
// stored, then the filler drafts the prose-derived properties, checks its terms
// against VAIR and reviews the draft. A stage may only be named here while the
// save really triggers it.
//
// The overlay ends at the redirect; the filler runs on, and the card reports it
// from there. Which stage is live is not observable here, so the list advances
// on a timer and holds on the last, with no percentage or ticks.
export const STAGES = [
  "Checking your answers",
  "Saving the qualification",
  "Drafting the nodes your prose answers support",
  "Checking the terms against the vocabulary",
  "Reviewing the draft before you see it",
] as const;

const STAGE_MS = 1400;

export default function SubmitOverlay({ open }: { open: boolean }) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!open) {
      setStage(0);
      return;
    }
    const timer = setInterval(() => {
      // Stops on the last one rather than cycling: this is a sequence of work,
      // not a spinner pretending to be one.
      setStage((current) => Math.min(current + 1, STAGES.length - 1));
    }, STAGE_MS);
    return () => clearInterval(timer);
  }, [open]);

  if (!open) return null;

  const dialog = (
    <div className="submit-overlay">
      <div className="submit-card" role="status" aria-live="polite">
        <h2>Building your AI card</h2>
        <p className="submit-sub">
          Your answers are being checked and stored. The card is the filled AIRO
          graph, assembled from them.
        </p>

        <Animation stage={stage} />

        <ol className="submit-stages">
          {STAGES.map((label, i) => (
            <li
              key={label}
              className={[
                "submit-stage",
                i === stage ? "is-current" : "",
                i < stage ? "is-past" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {label}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );

  return typeof document === "undefined"
    ? dialog
    : createPortal(dialog, document.body);
}

/** Three answers flowing through the review loop into a card.
 *
 * Decoration, and marked as such: the stage list above carries the meaning, so
 * this is aria-hidden rather than described twice. */
function Animation({ stage }: { stage: number }) {
  return (
    <svg
      className="submit-anim"
      viewBox="0 0 420 120"
      aria-hidden="true"
      data-stage={stage}
    >
      {/* the answers, as lines of prose */}
      <g className="submit-anim-answers">
        {[0, 1, 2, 3].map((i) => (
          <rect
            key={i}
            x={8}
            y={26 + i * 18}
            width={i === 3 ? 52 : 78}
            height={8}
            rx={2}
            style={{ animationDelay: `${i * 140}ms` }}
          />
        ))}
      </g>

      {/* the loop: draft, check, review, going round while it waits */}
      <g className="submit-anim-loop">
        <circle cx={210} cy={60} r={34} className="submit-anim-ring" />
        <circle cx={210} cy={26} r={5} className="submit-anim-dot" />
        <circle cx={210} cy={60} r={13} className="submit-anim-core" />
      </g>

      {/* the particles crossing from the answers into the loop */}
      <g className="submit-anim-flow">
        {[0, 1, 2].map((i) => (
          <circle
            key={i}
            cx={0}
            cy={60}
            r={3}
            style={{ animationDelay: `${i * 420}ms` }}
          />
        ))}
      </g>

      {/* and what leaves it, becoming the card */}
      <g className="submit-anim-flow submit-anim-flow--out">
        {[0, 1, 2].map((i) => (
          <circle
            key={i}
            cx={0}
            cy={60}
            r={3}
            style={{ animationDelay: `${200 + i * 420}ms` }}
          />
        ))}
      </g>

      {/* the card, filling in as the stages pass */}
      <g className="submit-anim-card">
        <rect x={300} y={18} width={104} height={84} rx={3} />
        {[0, 1, 2, 3].map((i) => (
          <rect
            key={i}
            className="submit-anim-cardline"
            x={312}
            y={32 + i * 16}
            width={i % 2 ? 58 : 78}
            height={6}
            rx={2}
            style={{ animationDelay: `${600 + i * 300}ms` }}
          />
        ))}
      </g>
    </svg>
  );
}
