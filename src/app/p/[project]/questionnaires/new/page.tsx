import Link from "next/link";
import { projectDbPastDoor } from "@/lib/projectDb";
import { questionnairesOn } from "@/server/services/QuestionnaireService";
import QuestionnaireBuilder from "../QuestionnaireBuilder";
import { builderData } from "../libraryData";

// A new questionnaire, empty or (`?from=<questionnaire id>`) started from a
// listed, current questionnaire's latest version, pinned as it is (T31).
export default async function NewQuestionnairePage({
  params,
  searchParams,
}: {
  params: Promise<{ project: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { project } = await params;
  const db = await projectDbPastDoor(project);
  const { from } = await searchParams;
  const [{ groups }, source] = await Promise.all([
    builderData(db),
    from ? questionnairesOn(db).latestVersion(from) : Promise.resolve(null),
  ]);
  const startFrom = source && source.listed && !source.retired ? source : undefined;

  return (
    <main className="qualify-page qualify-page--wide qf-forms-page">
      <header className="qualify-header">
        <p className="qf-crumb">
          <Link href={`/p/${project}/questionnaires`}>← Questionnaires</Link>
        </p>
        <h1>New questionnaire</h1>
        <p>Select question sets, tick the questions to ask, and choose the blocks the questionnaire includes.</p>
      </header>
      <QuestionnaireBuilder project={project} groups={groups} initial={startFrom ? { startFrom } : {}} />
    </main>
  );
}
