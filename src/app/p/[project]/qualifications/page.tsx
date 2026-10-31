import Link from "next/link";
import { qualificationService } from "@/server/services/QualificationService";
import QualificationsList from "./QualificationsList";
import { updateAnswersLabel } from "@/domain/SystemCard";

export default async function QualificationsPage({
  params,
}: {
  params: Promise<{ project: string }>;
}) {
  const { project } = await params;
  const rows = await qualificationService.list(project);
  // Which AI card version each card is (a row of project.system in the project's database), highest first.
  // The list still shows when the platform cannot say, just without the numbers.
  const versions = await qualificationService.versions(project).catch(() => []);
  const versionOf = new Map(versions.map((v) => [v.pid, v]));

  // Only what it takes to pick one; the detail page loads the rest.
  const items = rows
    .map((q) => ({
      id: q.id,
      versionNumber: versionOf.get(q.systemId)?.number,
      createdBy: versionOf.get(q.systemId)?.created_by ?? null,
      systemName: q.systemName,
      systemVersion: q.systemVersion,
      company: q.company,
      description: q.description,
      savedAt: q.createdAt.toISOString(),
      answers: q.answers.length,
      risks: q.risks.length,
    }))
    .sort((a, b) => (b.versionNumber ?? 0) - (a.versionNumber ?? 0));

  return (
    <main className="qualify-page">
      <header className="qualify-header">
        <h1>AI card versions</h1>
        <p>
          The project has one AI system. Every save of its AI card makes the
          next version, and each older version keeps its card as it was. The
          highest is the latest, and only it changes.
        </p>
      </header>

      <div className="qf-list-actions">
        <Link className="btn ghost" href={`/p/${project}/system/edit`}>
          {updateAnswersLabel(items[0]?.versionNumber)}
        </Link>
      </div>

      <QualificationsList project={project} items={items} />
    </main>
  );
}
