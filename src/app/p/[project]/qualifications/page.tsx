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
        <h1>Versions of the AI system</h1>
        <p>
          The project has one AI system. Each time it is changed after being
          tested or described, it gets a new version, and each version keeps its
          AI card as it was. The newest is the current one.
        </p>
      </header>

      <div className="qf-list-actions">
        <Link className="btn ghost" href={`/p/${project}/system/edit`}>
          Edit the AI system
        </Link>
      </div>

      <QualificationsList project={project} items={items} />
    </main>
  );
}
