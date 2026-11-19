import Link from "next/link";
import { hasDrift, type ComponentDrift } from "@/domain/cardComponents";

// A folded one-line notice on the card: the engine's components no longer match what the card
// links, so the card needs a new version. Closed by default; nothing when nothing differs.
export default function CardDriftBanner({
  project,
  drift,
  readsOnly,
}: {
  project: string;
  drift: ComponentDrift;
  readsOnly: boolean;
}) {
  if (!hasDrift(drift)) return null;
  const count = drift.removed.length + drift.added.length + drift.changed.length;
  return (
    <details className="qf-prefilled" role="status">
      <summary>
        The engine&apos;s components no longer match this card ({count} changes)
      </summary>
      <ul>
        {drift.removed.map((c) => (
          <li key={`r-${c.componentPid}`}>removed: {c.name}</li>
        ))}
        {drift.added.map((c) => (
          <li key={`a-${c.pid}`}>added: {c.name}</li>
        ))}
        {drift.changed.map((c) => (
          <li key={`c-${c.pid}`}>changed: {c.name}</li>
        ))}
      </ul>
      {!readsOnly && (
        <Link className="btn" href={`/p/${project}/system/edit`}>
          Start the next version
        </Link>
      )}
    </details>
  );
}
