import Link from "next/link";
import { qualificationService } from "@/server/services/QualificationService";
import QualificationsList from "./QualificationsList";

export default async function QualificationsPage({
  params,
}: {
  params: Promise<{ project: string }>;
}) {
  const { project } = await params;
  const rows = await qualificationService.list(project);
  // Which version of the project's one AI system each card describes. The
  // list still shows when the platform cannot say, just without the numbers.
  const numberOf = await qualificationService.versionNumbers(project).catch(() => new Map());

  // Only what it takes to pick one; the detail page loads the rest.
  const items = rows.map((q) => ({
    id: q.id,
    versionNumber: numberOf.get(q.systemId),
    systemName: q.systemName,
    systemVersion: q.systemVersion,
    company: q.company,
    description: q.description,
    savedAt: q.createdAt.toISOString(),
    answers: q.answers.length,
    risks: q.risks.length,
  }));

  return (
    <main className="qualify-page">
      <header className="qualify-header">
        <h1>AI cards</h1>
        <p>
          The project has one AI system, and each version of it has one AI card.
          Open one to read the answered form and the card built from it.
        </p>
      </header>

      <div className="qf-list-actions">
        <Link className="btn ghost" href={`/p/${project}/qualify/new`}>
          + AI card for the next version
        </Link>
      </div>

      <QualificationsList project={project} items={items} />
    </main>
  );
}
