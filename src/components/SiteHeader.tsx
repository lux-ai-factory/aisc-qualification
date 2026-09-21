import Link from "next/link";

/**
 * Inside a project every link stays inside it, so navigating never loses which
 * project is being qualified. Outside one there are no qualifications to link
 * to, only the methodology, which reads the same for everyone.
 */
export default function SiteHeader({ project }: { project?: string }) {
  // Static files in public/ are not prefixed with the configured basePath the
  // way Next's own /_next assets are, so build the src explicitly. Read at
  // render time on the server (same runtime NEXT_BASE_PATH next.config uses).
  const basePath = process.env.NEXT_BASE_PATH || "";
  return (
    <header className="site-header">
      <div className="inner">
        <Link href={project ? `/p/${project}` : "/"} className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${basePath}/laif-logo.svg`} alt="Luxembourg AI Factory" />
          <span className="divider" />
          <span>AI System Qualification</span>
        </Link>
        <nav className="site-nav">
          {project && (
            <Link href={`/p/${project}/qualifications`}>Qualifications</Link>
          )}
          <Link href="/methodology">Methodology</Link>
        </nav>
      </div>
    </header>
  );
}
