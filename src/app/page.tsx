import Link from "next/link";

export default function HomePage() {
  return (
    <main className="welcome">
      <span className="eyebrow">AI System Qualification</span>
      <h1>Welcome.</h1>
      <p>
        Use this tool to qualify an AI system against the EU AI Act evaluation
        criteria (Articles 10, 12, 13 and 14) and generate a system card from
        your structured responses with one click.
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
