import Link from "next/link";
import QuestionSetEditor from "../QuestionSetEditor";

// A new question set: its name, its description and the questions it writes.
export default async function NewQuestionSetPage({
  params,
}: {
  params: Promise<{ project: string }>;
}) {
  const { project } = await params;
  return (
    <main className="qualify-page qualify-page--form qf-forms-page">
      <header className="qualify-header">
        <p className="qf-crumb">
          <Link href={`/p/${project}/question-sets`}>← Question sets</Link>
        </p>
        <h1>New question set</h1>
        <p>Write the questions. Questionnaires then pick from them.</p>
      </header>
      <QuestionSetEditor project={project} initial={{}} />
    </main>
  );
}
