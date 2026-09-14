import Link from "next/link";
import { qualificationService } from "@/server/services/QualificationService";
import QualificationsList from "./QualificationsList";

export default async function QualificationsPage() {
  const rows = await qualificationService.list();

  // Only what it takes to pick one; the detail page loads the rest.
  const items = rows.map((q) => ({
    id: q.id,
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
        <h1>Compiled qualifications</h1>
        <p>
          Every system you have qualified. Open one to read the answered form and
          the AI card built from it.
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
