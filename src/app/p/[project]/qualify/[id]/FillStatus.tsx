"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { rerunFill } from "./fill-actions";

// Refine with AI, and its progress.
//
// The card is built from the form alone (2026-09-30). The filler runs only when
// a person presses Refine with AI, and reads only the answers to the questions:
// the form's structured fields are VAIR terms their author chose, so what is left
// is the techniques answer 2(a) describes. A run takes a minute or several on a reasoning
// model, so while it is in flight this says so, and brings the result in when it
// lands.
const POLL_MS = 2000;

type State = "idle" | "queued" | "running" | "done" | "failed";

export default function FillStatus({
  project,
  qualificationId,
  statusUrl,
}: {
  project: string;
  qualificationId: string;
  /** Where this card's run state is read: the fill route under its project. */
  statusUrl: string;
}) {
  const [state, setState] = useState<State>("idle");
  // Bumped by each regenerate, which starts the poll over for the new run.
  const [run, setRun] = useState(0);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const refreshed = useRef(false);
  // Held in a ref and kept out of the effect's dependencies: the effect starts a
  // poll, and a router object with a new identity would restart it on every
  // state change, which is a loop rather than a poll.
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const ask = async () => {
      try {
        const res = await fetch(statusUrl, { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { state?: State };
        if (!live) return;
        const next = body.state ?? "idle";
        setState(next);
        if (next === "queued" || next === "running") {
          timer = setTimeout(ask, POLL_MS);
        } else if (next === "done" && !refreshed.current) {
          // Once only: the draft is in the graph now, and the card is built on
          // read, so a refresh is what makes it appear.
          refreshed.current = true;
          routerRef.current.refresh();
        }
      } catch {
        // No status service, or none reachable. The card is complete without
        // it; saying nothing is better than an error about an extra.
      }
    };

    refreshed.current = false;
    ask();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [qualificationId, statusUrl, run]);

  const regenerate = async () => {
    setStarting(true);
    setError(null);
    const result = await rerunFill(project, qualificationId);
    setStarting(false);
    if (!result.ok) {
      setError(result.error ?? "Could not start the card agent.");
      return;
    }
    setState("queued");
    setRun((n) => n + 1);
  };

  if (state !== "queued" && state !== "running") {
    return (
      <div className="fill-rerun">
        {state === "failed" && (
          <p className="fill-status" role="status" aria-live="polite">
            The AI refinement could not finish. The card below is built from your answers.
          </p>
        )}
        <button type="button" className="btn ghost qf-header-btn" onClick={regenerate} disabled={starting}>
          {starting ? "Starting..." : "Refine with AI"}
        </button>
        {error && (
          <span className="fill-rerun-error" role="alert">
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="fill-status" role="status" aria-live="polite">
      <span className="fill-status-spinner" aria-hidden="true" />
      Refining the card with AI: proposing what your answers support beyond what the
      card already lists, and reviewing it. This card will fill in by itself.
    </div>
  );
}
