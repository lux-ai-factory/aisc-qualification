/**
 * Calling a server action from a component.
 *
 * An action says what went wrong by returning {error}; it can also throw, or its
 * request can fail on the way (the network, a server error). Each of those is one
 * answer here, so a button never stays busy and a person always reads why.
 */
import { useCallback, useState } from "react";

/** What a person reads when the action threw: its text may hold internals, so it is not shown. */
export const ACTION_FAILED = "This could not be done just now. Try again.";

/** An action's outcome. A failure keeps what the action returned, when it returned something. */
export type ActionOutcome<R> = { ok: true; value: R } | { ok: false; error: string; value?: R };

/** Next's redirect and notFound are errors whose digest starts with NEXT_: the router handles them. */
function isNextNavigation(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

/** Run `action`: a returned {error} is passed on as it is, a throw or a rejection is ACTION_FAILED.
 *  Never throws, except to let Next's own redirect through. */
export async function runAction<R>(action: () => Promise<R>): Promise<ActionOutcome<R>> {
  try {
    const value = await action();
    const error = (value as { error?: unknown } | null | undefined)?.error;
    if (typeof error === "string" && error) return { ok: false, error, value };
    return { ok: true, value };
  } catch (err) {
    if (isNextNavigation(err)) throw err;
    console.error("server action failed", err);
    return { ok: false, error: ACTION_FAILED };
  }
}

/** runAction for a component: whether the action is running, and the error of the last run. */
export function useServerAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <R>(action: () => Promise<R>): Promise<ActionOutcome<R>> => {
    setBusy(true);
    setError(null);
    try {
      const outcome = await runAction(action);
      if (!outcome.ok) setError(outcome.error);
      return outcome;
    } finally {
      setBusy(false);
    }
  }, []);
  return { run, busy, error, setError };
}
