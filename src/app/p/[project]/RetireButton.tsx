"use client";

import { useState } from "react";
import { useServerAction } from "@/lib/serverAction";

/**
 * Archive a question set or a questionnaire. Asks once; the action's
 * {error} shows under the buttons. Archiving hides the thing from pickers; what
 * already uses it keeps it.
 */
export default function RetireButton({
  name,
  action,
}: {
  name: string;
  action: () => Promise<{ error?: string } | void>;
}) {
  const [asking, setAsking] = useState(false);
  const { run, busy, error } = useServerAction();

  async function confirm() {
    if ((await run(action)).ok) setAsking(false);
  }

  return (
    <span className="qf-retire">
      {asking ? (
        <>
          <span className="qf-retire-question">
            Archive {name}? Cards and questionnaires that use it keep it.
          </span>{" "}
          <button
            type="button"
            className="btn ghost"
            onClick={confirm}
            disabled={busy}
          >
            Archive
          </button>{" "}
          <button
            type="button"
            className="btn ghost"
            onClick={() => setAsking(false)}
            disabled={busy}
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn ghost"
          onClick={() => setAsking(true)}
        >
          Archive
        </button>
      )}
      {error && <div className="error">{error}</div>}
    </span>
  );
}
