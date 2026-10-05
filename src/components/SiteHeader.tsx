import Link from "next/link";
import { launcherUrl } from "@/lib/launcher";
import NavMenu from "@/components/NavMenu";

/**
 * The header.
 *
 * Inside a project every link stays inside it, so navigating never loses which
 * project is being qualified, and the first of them goes back to that project's
 * page on the launcher, where the other five steps are. Outside one there are
 * no qualifications to link to, only the methodology, which reads the same for
 * everyone.
 *
 * Inside a project the question sets, the questionnaires and the methodology
 * share one "Framework" menu: what a qualification is measured by, as opposed
 * to the system and its versions, which are what gets measured.
 */
export default function SiteHeader({ project }: { project?: string }) {
  // Static files in public/ are not prefixed with the configured basePath the
  // way Next's own /_next assets are, so build the src explicitly. Read at
  // render time on the server (same runtime NEXT_BASE_PATH next.config uses).
  const basePath = process.env.NEXT_BASE_PATH || "";
  const launcher = launcherUrl().replace(/\/+$/, "");
  const projectPage = project
    ? `${launcher}/p/${encodeURIComponent(project)}`
    : null;
  return (
    <header className="site-header">
      <div className="inner">
        <a href={projectPage ?? launcher} className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${basePath}/laif-logo.svg`} alt="Luxembourg AI Factory" />
          <span className="divider" />
          <span>AI System Qualification</span>
        </a>
        <nav className="site-nav">
          {projectPage && (
            <a href={projectPage} aria-label="Back to the project">
              ← Back
            </a>
          )}
          {project && (
            <>
              <Link href={`/p/${project}/system`}>AI system</Link>
              <Link href={`/p/${project}/qualifications`}>Versions</Link>
              <NavMenu label="Framework">
                <Link href={`/p/${project}/question-sets`}>Question sets</Link>
                <Link href={`/p/${project}/questionnaires`}>
                  Questionnaires
                </Link>
                <Link href="/methodology">Methodology</Link>
              </NavMenu>
            </>
          )}
          {!project && <Link href="/methodology">Methodology</Link>}
        </nav>
      </div>
    </header>
  );
}
