import Link from "next/link";
import { launcherUrl } from "@/lib/launcher";
import ProjectNav from "@/components/ProjectNav";

/**
 * The header.
 *
 * Inside a project every link stays inside it, so navigating never loses which
 * project is being qualified, and the first of them goes back to that project's
 * page on the launcher, where the other five steps are. Outside one there are
 * no qualifications to link to, only the methodology, which reads the same for
 * everyone.
 *
 * Inside a project the links are ProjectNav's, and "← Back" is a button of its
 * own beside them: a card page moves the links into its left menu, never Back.
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
        {projectPage && (
          <a
            href={projectPage}
            className="btn ghost site-back"
            aria-label="Back to the project"
          >
            ← Back to the project
          </a>
        )}
        {project ? (
          <ProjectNav project={project} />
        ) : (
          <nav className="site-nav">
            <Link href="/methodology">How the AI card is built</Link>
          </nav>
        )}
      </div>
    </header>
  );
}
