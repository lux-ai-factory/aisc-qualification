import Link from "next/link";
import { redirect } from "next/navigation";
import { qualificationService } from "@/server/services/QualificationService";
import { engineClient } from "@/server/services/EngineClient";
import { componentDrift, hasDrift } from "@/domain/cardComponents";
import { versionLabel } from "@/domain/cardVersions";
import { callerReadsOnly, READS_ONLY } from "@/server/access/readsOnly";

// The project's one AI system is described by its latest AI card version.
// With no card to show (no version yet, or a latest version without a card) it
// opens the empty form: there is nothing else to do here. A platform that does
// not answer, about the versions or about which card is current, gets a page of
// its own: the project may well have cards, so nothing says it has none.
export default async function SystemPage({
  params,
}: {
  params: Promise<{ project: string }>;
}) {
  const { project } = await params;
  let unanswered = false;
  const failed = () => {
    unanswered = true;
    return null;
  };
  const versions = await qualificationService.versions(project).catch(failed);
  const latest = versions?.[0];
  const current = latest
    ? await qualificationService.currentCardId(project).catch(failed)
    : null;
  const card = current
    ? await qualificationService.get(project, current).catch(failed)
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
          {card.revision > 1 && (
            <h2>{versionLabel(latest?.number ?? 0, card.revision)}</h2>
          )}
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
          {(await callerReadsOnly(project)) ? (
            <p>{READS_ONLY}</p>
          ) : (
            <Link className="btn" href={`/p/${project}/system/edit`}>
              Start the next version
            </Link>
          )}
        </div>
      </main>
    );
  }

  if (!unanswered) redirect(`/p/${project}/system/edit`);

  return (
    <main className="qualify-page">
      <header className="qualify-header">
        <h1>The AI card cannot be shown right now</h1>
        <p>
          The platform did not answer, so the AI card versions cannot be shown.
          Try again in a moment.
        </p>
      </header>
      {!(await callerReadsOnly(project)) && (
        <div className="qf-list-actions">
          <Link className="btn" href={`/p/${project}/system/edit`}>
            Update the answers
          </Link>
        </div>
      )}
    </main>
  );
}
