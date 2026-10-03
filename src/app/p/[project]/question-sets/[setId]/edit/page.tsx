import Link from "next/link";
import { notFound } from "next/navigation";
import { projectDbPastDoor } from "@/lib/projectDb";
import { questionSetsOn } from "@/server/services/QuestionSetService";
import QuestionSetEditor from "../../QuestionSetEditor";

// Edit a question set: saving makes its next version. Annex IV and
// retired sets are not edited.
export default async function EditQuestionSetPage({
  params,
}: {
  params: Promise<{ project: string; setId: string }>;
}) {
  const { project, setId } = await params;
  const latest = await questionSetsOn(await projectDbPastDoor(project)).latest(setId);
  if (!latest || latest.builtin || latest.retired) notFound();

  return (
    <main className="qualify-page qualify-page--form qf-forms-page">
      <header className="qualify-header">
        <p className="qf-crumb">
          <Link href={`/p/${project}/question-sets`}>← Question sets</Link>
        </p>
        <h1>Edit {latest.setName}</h1>
        <p>
          v{latest.versionNumber} is the latest version. Saving makes v{latest.versionNumber + 1}; questionnaires
          pinned to earlier versions keep them.
        </p>
      </header>
      <QuestionSetEditor project={project} initial={{ edit: latest }} latestNumber={latest.versionNumber} />
    </main>
  );
}
