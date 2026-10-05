"use client";

import { useState } from "react";

/**
 * Retire a question set or a questionnaire. Asks once; the action's
 * {error} shows under the buttons. Retiring hides the thing from pickers; what
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (result && result.error) setError(result.error);
      else setAsking(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="qf-retire">
      {asking ? (
        <>
          <span className="qf-retire-question">
            Retire {name}? Cards and questionnaires that use it keep it.
          </span>{" "}
          <button
            type="button"
            className="btn ghost"
            onClick={confirm}
            disabled={busy}
          >
            Retire
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
          Retire
        </button>
      )}
      {error && <div className="error">{error}</div>}
    </span>
  );
}
