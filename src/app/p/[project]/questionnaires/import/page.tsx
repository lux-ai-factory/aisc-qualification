import Link from "next/link";
import QuestionnaireImport from "./QuestionnaireImport";
import { projectDbPastDoor } from "@/lib/projectDb";
import { builderData } from "../libraryData";

// Import a questionnaire file: by reference it opens the builder, a
// self-contained one creates a question set and a questionnaire.
export default async function ImportQuestionnairePage({
  params,
}: {
  params: Promise<{ project: string }>;
}) {
  const { project } = await params;
  const { groups } = await builderData(await projectDbPastDoor(project));

  // QuestionnaireImport renders the page's main: a form's width while
  // uploading, wide once the builder mounts.
  const header = (
    <header className="qualify-header">
      <p className="qf-crumb">
        <Link href={`/p/${project}/questionnaires`}>← Questionnaires</Link>
      </p>
      <h1>Import a questionnaire</h1>
      <p>
        A questionnaire file names the question-set versions it picks from. A
        self-contained file also carries their wording, and makes a new question
        set with it.
      </p>
    </header>
  );
  return (
    <QuestionnaireImport project={project} groups={groups} header={header} />
  );
}
