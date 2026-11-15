"use client";

import Link from "next/link";

/**
 * The app's own page for an error nothing else caught. A form answers its failures
 * itself and keeps what was typed; this page is only the backstop, so a person reads
 * a sentence and a way on instead of the framework's generic error screen. The error
 * text is not shown: it may hold internals, and the server has logged it.
 */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main>
      <h1>Something went wrong</h1>
      <div className="error">This page could not be shown just now.</div>
      <p>
        <button type="button" onClick={() => reset()}>
          Try again
        </button>{" "}
        or go back to the <Link href="/">start page</Link>.
      </p>
    </main>
  );
}
