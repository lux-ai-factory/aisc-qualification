"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// While the filler is drafting this card, say so, and bring in the result when
// it lands.
//
// The run starts when the qualification is saved and takes seconds to a minute,
// so arriving on the card usually means arriving before the draft exists. With
// nothing here, the card looks like it simply has no techniques or components,
// which is exactly how a working pipeline looks broken.
const POLL_MS = 2000;

type State = "idle" | "queued" | "running" | "done" | "failed";

export default function FillStatus({
  qualificationId,
}: {
  qualificationId: string;
}) {
  const [state, setState] = useState<State>("idle");
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
        const res = await fetch(
          `/api/qualifications/${qualificationId}/fill`,
          { cache: "no-store" },
        );
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

    ask();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [qualificationId]);

  if (state === "idle" || state === "done") return null;

  return (
    <div className="fill-status" role="status" aria-live="polite">
      {state === "failed" ? (
        <>The filler could not finish. The card below is built from your answers.</>
      ) : (
        <>
          <span className="fill-status-spinner" aria-hidden="true" />
          Drafting the nodes your prose answers support, and reviewing them. This
          card will fill in by itself.
        </>
      )}
    </div>
  );
}
