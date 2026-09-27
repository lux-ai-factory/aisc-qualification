import { sectors, targetSystems } from "@/data";
import { KEY_QUESTIONS } from "@/data/keyQuestions";
import { findExample } from "@/data/examples";
import { qualificationService } from "@/server/services/QualificationService";
import QualifyForm from "../../qualify/new/QualifyForm";

export default async function EditSystemPage({
  params,
  searchParams,
}: {
  params: Promise<{ project: string }>;
  searchParams: Promise<{ example?: string }>;
}) {
  const { project } = await params;
  // `?example=mcas` opens the form already filled, to be read and corrected
  // rather than typed. It writes nothing: the person still presses the button.
  const { example } = await searchParams;
  const worked = findExample(example);
  // Otherwise the card starts from the latest card, to be reviewed: every save
  // makes the next version, and the next version is mostly the last one again.
  const start = worked
    ? null
    : await qualificationService.startingPoint(project).catch(() => null);
  const initial = worked ?? start?.initial ?? null;

  return (
    <main className="qualify-page qualify-page--form">
      <header className="qualify-header">
        <h1>
          {start?.initial ? "Edit the AI system" : "Describe the AI system"}
        </h1>
        <p>
          {start
            ? `Saving makes v${start.next.versionNumber} of the AI card; `
              + "earlier versions stay as they were."
            : "The project's one AI system: describe it and answer the questions below."}
        </p>
        {start?.initial && (
          <p className="qf-prefilled">
            Filled in from v{start.next.fromVersionNumber}. Change what is no longer
            true, then save: that makes v{start.next.versionNumber}.
          </p>
        )}
        {worked && (
          <p className="qf-prefilled">
            Filled in from the documentation for{" "}
            <strong>{worked.metadata.systemName}</strong>. Read it, correct
            anything the documents do not support, then save.
          </p>
        )}
      </header>
      <QualifyForm
        project={project}
        keyQuestions={KEY_QUESTIONS}
        targetSystems={targetSystems}
        sectors={sectors}
        initial={initial ?? undefined}
      />
    </main>
  );
}
