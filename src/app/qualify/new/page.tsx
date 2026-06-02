import { sectors, targetSystems } from "@/data";
import { KEY_QUESTIONS } from "@/data/keyQuestions";
import QualifyForm from "./QualifyForm";

export default function NewQualificationPage() {
  return (
    <main className="qualify-page">
      <header className="qualify-header">
        <h1>Qualify an AI system</h1>
        <p>
          Provide system metadata and answer the questions below to build a
          structured profile of the system.
        </p>
      </header>
      <QualifyForm
        keyQuestions={KEY_QUESTIONS}
        targetSystems={targetSystems}
        sectors={sectors}
      />
    </main>
  );
}
