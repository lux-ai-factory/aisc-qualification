import { tools, sectors, targetSystems } from "@/data";
import { KEY_QUESTIONS } from "@/data/keyQuestions";
import QualifyForm from "./QualifyForm";

export default function NewQualificationPage() {
  // Resolve key question metadata for the required block.
  const keyQuestions = KEY_QUESTIONS.map((k) => {
    const tool = tools[k.toolId];
    if (!tool) throw new Error(`Unknown tool ${k.toolId}`);
    for (const part of tool.parts) {
      for (const section of part.sections) {
        const q = section.questions.find((q) => q.id === k.questionId);
        if (q) {
          return {
            toolId: tool.id,
            toolTitle: tool.title,
            toolArticle: tool.article,
            sectionCategory: section.category,
            references: section.ai_act_references,
            question: q,
          };
        }
      }
    }
    throw new Error(`Question ${k.questionId} not found in ${k.toolId}`);
  });

  return (
    <main className="qualify-page">
      <header className="qualify-header">
        <h1>Qualify an AI system</h1>
        <p>
          Provide system metadata and answer the key compliance questions drawn
          from Articles 10, 12, 13, and 14 of the AI Act.
        </p>
      </header>
      <QualifyForm
        keyQuestions={keyQuestions}
        targetSystems={targetSystems}
        sectors={sectors}
      />
    </main>
  );
}
