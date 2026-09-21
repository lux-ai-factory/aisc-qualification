import Link from "next/link";

export default async function HomePage({
  params,
}: {
  params: Promise<{ project: string }>;
}) {
  const { project } = await params;
  return (
    <main className="welcome">
      <span className="eyebrow">AI System Qualification</span>
      <h1>Welcome.</h1>
      <p>
        Use this tool to qualify an AI system by answering a short set of
        questions about its data, documentation, transparency, oversight, and
        risks — then generate a AI card from your responses with one click.
      </p>

      <div className="actions">
        <Link className="btn" href={`/p/${project}/qualify/new`}>
          Start a qualification
        </Link>
        <Link className="btn ghost" href={`/p/${project}/qualifications`}>
          View qualifications
        </Link>
      </div>
    </main>
  );
}
