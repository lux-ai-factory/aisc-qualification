import Link from "next/link";
import { qualificationService } from "@/server/services/QualificationService";
import QualificationsList from "./QualificationsList";

export default async function QualificationsPage() {
  const rows = await qualificationService.list();

  const items = rows.map((q) => ({
    id: q.id,
    systemName: q.systemName,
    systemVersion: q.systemVersion,
    company: q.company,
    description: q.description,
    targetUseCase: q.targetUseCase,
    targetUsers: q.targetUsers,
    targetSystemTags: q.targetSystemTags,
    sectorTags: q.sectorTags,
    createdAt: q.createdAt.toISOString(),
    hasSystemCard: q.systemCardJson != null,
    systemCardJson: (q.systemCardJson as Record<string, unknown>) ?? null,
    systemCardAt: q.systemCardAt?.toISOString() ?? null,
    answers: q.answers.map((a) => ({
      id: a.id,
      toolId: a.toolId,
      questionId: a.questionId,
      answer: a.answer,
    })),
  }));

  return (
    <main className="qualify-page">
      <header className="qualify-header">
        <h1>Compiled qualifications</h1>
        <p>
          Every system you have qualified, with the AI Act system card generated
          from each one.
        </p>
      </header>

      <div className="qf-list-actions">
        <Link className="btn ghost" href="/qualify/new">
          + New qualification
        </Link>
      </div>

      <QualificationsList items={items} />
    </main>
  );
}
