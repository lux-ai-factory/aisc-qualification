import Link from "next/link";
import { redirect } from "next/navigation";
import { qualificationService } from "@/server/services/QualificationService";
import { engineClient } from "@/server/services/EngineClient";
import { componentDrift, hasDrift } from "@/domain/cardComponents";

// The project's one AI system is described by its latest AI card version.
// With no card to show (no version yet, or a latest version without a card) it
// opens the empty form: there is nothing else to do here. Only a platform that
// does not answer gets a page of its own.
export default async function SystemPage({
  params,
}: {
  params: Promise<{ project: string }>;
}) {
  const { project } = await params;
  const versions = await qualificationService
    .versions(project)
    .catch(() => null);
  const latest = versions?.[0];
  const current = latest
    ? await qualificationService.currentCardId(project).catch(() => null)
    : null;
  const card = current
    ? await qualificationService.get(project, current).catch(() => null)
    : null;

  if (card) {
    // Drift between the latest card's links and the engine is shown, not
    // fixed. An engine that is down makes no claim either way.
    const engine = await engineClient.components(project).catch(() => null);
    const drift = engine ? componentDrift(card.components, engine) : null;
    if (!drift || !hasDrift(drift))
      redirect(`/p/${project}/qualify/${card.id}`);
    return (
      <main className="qualify-page">
        <header className="qualify-header">
          <h1>{card.systemName}</h1>
          <p>
            v{latest?.number} is the latest AI card.{" "}
            <Link href={`/p/${project}/qualify/${card.id}`}>Open it</Link>
          </p>
        </header>
        <div className="qf-prefilled" role="status">
          <p>
            The engine&rsquo;s components no longer match what this card links:
          </p>
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
          <Link className="btn" href={`/p/${project}/system/edit`}>
            Start the next version
          </Link>
        </div>
      </main>
    );
  }

  if (versions !== null) redirect(`/p/${project}/system/edit`);

  return (
    <main className="qualify-page">
      <header className="qualify-header">
        <h1>No AI card yet</h1>
        <p>
          The platform did not answer, so the AI card versions cannot be shown.
        </p>
      </header>
      <div className="qf-list-actions">
        <Link className="btn" href={`/p/${project}/system/edit`}>
          Edit the AI system
        </Link>
      </div>
    </main>
  );
}
