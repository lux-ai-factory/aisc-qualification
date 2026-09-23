import Link from "next/link";
import { redirect } from "next/navigation";
import { qualificationService } from "@/server/services/QualificationService";

// The project's one AI system is described by its latest AI card version.
// With no version yet, or a latest version whose card was never stored (a save
// that failed after naming it), the page says so and offers the edit.
export default async function SystemPage({
  params,
}: {
  params: Promise<{ project: string }>;
}) {
  const { project } = await params;
  const versions = await qualificationService.versions(project).catch(() => null);
  const latest = versions?.[0];
  const current = latest ? await qualificationService.currentCardId(project).catch(() => null) : null;
  if (current) redirect(`/p/${project}/qualify/${current}`);

  return (
    <main className="qualify-page">
      <header className="qualify-header">
        <h1>{latest ? `v${latest.number} has no card yet` : "No AI card yet"}</h1>
        <p>
          {versions === null
            ? "The platform did not answer, so the AI card versions cannot be shown."
            : "Describe the project's one AI system: saving makes its next AI card version."}
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
