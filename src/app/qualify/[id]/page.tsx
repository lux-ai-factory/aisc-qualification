import Link from "next/link";
import { notFound } from "next/navigation";
import { qualificationService } from "@/server/services/QualificationService";
import GenerateCardButton from "./GenerateCardButton";

export default async function QualificationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Raw <a href> links are not rewritten by Next's basePath — prefix explicitly
  // (same pattern as SiteHeader) so the download works when served under a subpath.
  const basePath = process.env.NEXT_BASE_PATH || "";

  const q = await qualificationService.get(id);
  if (!q) notFound();

  const lastGeneratedAt = q.systemCardAt
    ?.toISOString()
    .slice(0, 16)
    .replace("T", " ");

  return (
    <main className="qualify-page">
      <header className="qualify-header">
        <h1>{q.systemName}</h1>
        <p>
          {q.company} · v{q.systemVersion} · saved{" "}
          {q.createdAt.toISOString().slice(0, 10)}
        </p>
      </header>

      <section className="qf-cta">
        <div>
          <h2>Generate the system card</h2>
          <p>
            {q.systemCardJson
              ? `Last generated ${lastGeneratedAt} UTC — regenerate to pick up new answers.`
              : "Turn this qualification into a structured Markdown system card with one click."}
          </p>
        </div>
        <GenerateCardButton
          qualificationId={q.id}
          hasCard={!!q.systemCardJson}
        />
      </section>

      {q.systemCardJson != null && (
        <section className="qf-section">
          <h2>System card</h2>
          <p>
            <a
              className="btn"
              href={`${basePath}/api/qualifications/${q.id}/system-card.pdf`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ width: "auto", padding: "10px 16px" }}
            >
              Download PDF
            </a>
          </p>
        </section>
      )}

      <section className="qf-section">
        <h2>Metadata</h2>
        <p>
          <strong>Description:</strong> {q.description}
        </p>
        <p>
          <strong>Target use case:</strong> {q.targetUseCase}
        </p>
        <p>
          <strong>Target users:</strong> {q.targetUsers}
        </p>
      </section>

      <section className="qf-section">
        <h2>Answers ({q.answers.length})</h2>
        {q.answers.map((a) => (
          <div key={a.id} className="qf-answer">
            <code>
              {a.toolId}:{a.questionId}
            </code>
            <p>{a.answer}</p>
          </div>
        ))}
      </section>

      <p>
        <Link href="/">Back to home</Link>
      </p>
    </main>
  );
}
