import Link from "next/link";
import QuestionSetImport from "./QuestionSetImport";

// Import a question set from a CSV, Markdown or Word file, then finish it in
// the set editor.
export default async function ImportQuestionSetPage({
  params,
}: {
  params: Promise<{ project: string }>;
}) {
  const { project } = await params;

  // QuestionSetImport renders the page's main, a form's width at every step.
  const header = (
    <header className="qualify-header">
      <p className="qf-crumb">
        <Link href={`/p/${project}/question-sets`}>← Question sets</Link>
      </p>
      <h1>Import a question set</h1>
      <p>
        One question per row or line. Headings are skipped, and a citation in
        [brackets] after a question is kept as its citation.
      </p>
    </header>
  );
  return <QuestionSetImport project={project} header={header} />;
}
