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
        Describe the project&apos;s AI system by answering a short set of questions
        about its data, documentation, transparency, oversight and risks, and
        get its AI card. Change it later and it keeps every earlier version.
      </p>

      <div className="actions">
        <Link className="btn" href={`/p/${project}/system`}>
          Open the AI system
        </Link>
        <Link className="btn ghost" href={`/p/${project}/qualifications`}>
          Versions
        </Link>
      </div>
    </main>
  );
}
