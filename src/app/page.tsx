import Link from "next/link";

export default function HomePage() {
  return (
    <main className="welcome">
      <span className="eyebrow">AI System Qualification</span>
      <h1>Welcome.</h1>
      <p>
        Use this tool to qualify an AI system by answering a short set of
        questions about its data, documentation, transparency, oversight, and
        risks — then generate a system card from your responses with one click.
      </p>

      <div className="actions">
        <Link className="btn" href="/qualify/new">
          Start a qualification
        </Link>
        <Link className="btn ghost" href="/qualifications">
          View qualifications
        </Link>
      </div>
    </main>
  );
}
