import Link from "next/link";
import { redirect } from "next/navigation";
import { qualificationService } from "@/server/services/QualificationService";
import { callerReadsOnly, READS_ONLY } from "@/server/access/readsOnly";

// The project's one AI system is described by its latest AI card version, and the
// qualification opens straight on it (the card page says when the engine differs).
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

  if (card) redirect(`/p/${project}/qualify/${card.id}`);

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
