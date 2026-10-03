import Link from "next/link";
import { notFound } from "next/navigation";
import { projectDbPastDoor } from "@/lib/projectDb";
import { questionnairesOn } from "@/server/services/QuestionnaireService";
import QuestionnaireBuilder from "../../QuestionnaireBuilder";
import { builderData } from "../../libraryData";

// Edit a questionnaire: saving makes its next version. The Annex IV
// default, use-once and retired questionnaires are not edited.
export default async function EditQuestionnairePage({
  params,
}: {
  params: Promise<{ project: string; questionnaireId: string }>;
}) {
  const { project, questionnaireId } = await params;
  const db = await projectDbPastDoor(project);
  const questionnaires = questionnairesOn(db);
  const v = await questionnaires.latestVersion(questionnaireId);
  if (!v || v.builtin || !v.listed || v.retired) notFound();
  const [{ groups }, history] = await Promise.all([builderData(db), questionnaires.history(questionnaireId)]);
  const stamp = history.find((h) => h.versionId === v.versionId) ?? history[0];

  return (
    <main className="qualify-page qualify-page--wide qf-forms-page">
      <header className="qualify-header">
        <p className="qf-crumb">
          <Link href={`/p/${project}/questionnaires`}>← Questionnaires</Link>
        </p>
        <h1>Edit {v.questionnaireName}</h1>
        {stamp && (
          <p className="qf-saved-by">
            {`v${stamp.number} saved by ${stamp.createdBy} on ${new Date(stamp.createdAt).toISOString().slice(0, 10)}`}
          </p>
        )}
        <p>
          v{v.versionNumber} is the latest version. Saving makes v{v.versionNumber + 1}; cards filled with
          earlier versions keep them.
        </p>
      </header>
      <QuestionnaireBuilder project={project} groups={groups} initial={{ edit: v }} />
    </main>
  );
}
