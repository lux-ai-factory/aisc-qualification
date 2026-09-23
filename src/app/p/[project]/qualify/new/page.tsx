import { sectors, targetSystems } from "@/data";
import { KEY_QUESTIONS } from "@/data/keyQuestions";
import { findExample } from "@/data/examples";
import { qualificationService } from "@/server/services/QualificationService";
import QualifyForm from "./QualifyForm";

export default async function NewQualificationPage({
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
  // Otherwise the card starts from the previous version's card, to be reviewed:
  // one card per version, and the next version is mostly the last one again.
  const start = worked
    ? null
    : await qualificationService.startingPoint(project).catch(() => null);
  const initial = worked ?? start?.initial ?? null;

  return (
    <main className="qualify-page qualify-page--form">
      <header className="qualify-header">
        <h1>
          {start ? `AI card for version ${start.next.versionNumber}` : "Qualify an AI system"}
        </h1>
        <p>
          Provide system metadata and answer the questions below to build a
          structured profile of the system.
        </p>
        {start?.initial && (
          <p className="qf-prefilled">
            Copied from the AI card of version {start.next.fromVersionNumber}. Review
            every answer against the system as it is now, then submit: submitting
            freezes version {start.next.versionNumber}.
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
