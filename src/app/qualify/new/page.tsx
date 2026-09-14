import { sectors, targetSystems } from "@/data";
import { KEY_QUESTIONS } from "@/data/keyQuestions";
import { findExample } from "@/data/examples";
import QualifyForm from "./QualifyForm";

export default async function NewQualificationPage({
  searchParams,
}: {
  searchParams: Promise<{ example?: string }>;
}) {
  // `?example=mcas` opens the form already filled, to be read and corrected
  // rather than typed. It writes nothing: the person still presses the button.
  const { example } = await searchParams;
  const initial = findExample(example);

  return (
    <main className="qualify-page qualify-page--form">
      <header className="qualify-header">
        <h1>Qualify an AI system</h1>
        <p>
          Provide system metadata and answer the questions below to build a
          structured profile of the system.
        </p>
        {initial && (
          <p className="qf-prefilled">
            Filled in from the documentation for{" "}
            <strong>{initial.metadata.systemName}</strong>. Read it, correct
            anything the documents do not support, then save.
          </p>
        )}
      </header>
      <QualifyForm
        keyQuestions={KEY_QUESTIONS}
        targetSystems={targetSystems}
        sectors={sectors}
        initial={initial ?? undefined}
      />
    </main>
  );
}
