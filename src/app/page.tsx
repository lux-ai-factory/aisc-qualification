import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { platformClient } from "@/server/services/PlatformClient";

/**
 * The app reached without a project.
 *
 * A qualification is of one project's system, and the system it describes is
 * named on the platform so the tests run against it and the results reported on
 * it mean the same system. So there is nothing to qualify until a project is
 * open, and this page's job is to open one rather than to explain that it
 * cannot.
 */
export default async function LandingPage() {
  const projects = await platformClient.projects();

  return (
    <>
      <SiteHeader />
      <main className="qualify-page">
        <header className="qualify-header">
          <h1>Qualify an AI system</h1>
          <p>
            Answer a short set of questions about a system&apos;s data,
            documentation, transparency, oversight and risks, and its AI card is
            generated from the answers.
          </p>
          <p>
            A qualification belongs to a project. Open one to see its
            qualifications, or start a new one inside it.
          </p>
        </header>

        {projects.length === 0 ? (
          <div className="qf-empty">
            <p>
              No projects to open. They are created on the launcher, which is
              also where every module opens from.
            </p>
            <Link className="btn" href="/methodology">
              Read the methodology
            </Link>
          </div>
        ) : (
          <>
            <ul className="qf-rows">
              {projects.map((project) => (
                <li key={project.pid}>
                  <Link className="qf-row" href={`/p/${project.pid}`}>
                    <div className="qf-row-main">
                      <h3>{project.name}</h3>
                      <p>{project.description ?? project.slug}</p>
                    </div>
                    <span className="qf-row-go">Open →</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="qf-prefilled">
              <Link href="/methodology">Read the methodology</Link> for how a
              qualification becomes an AI card.
            </p>
          </>
        )}
      </main>
    </>
  );
}
