import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

/**
 * The app without a project.
 *
 * A qualification describes one project's AI system, and the system it
 * describes is named on the platform so the tests run against it and the
 * results reported on it mean the same system. There is therefore nothing to
 * qualify until a project is open: the launcher is where one is chosen.
 */
export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main className="welcome">
        <span className="eyebrow">AI System Qualification</span>
        <h1>Welcome.</h1>
        <p>
          This tool qualifies an AI system by answering a short set of questions
          about its data, documentation, transparency, oversight and risks, then
          generates its AI card from those answers.
        </p>
        <p>
          A qualification is of one project&apos;s system. Open this module from
          a project on the launcher and its qualifications are right here.
        </p>
        <div className="actions">
          <Link className="btn ghost" href="/methodology">
            Read the methodology
          </Link>
        </div>
      </main>
    </>
  );
}
