import SiteHeader from "@/components/SiteHeader";
import { projectDbFor } from "@/lib/projectDb";

/**
 * Everything under here is one project's: the header links stay inside it.
 *
 * The middleware already asked the platform about this person and project. This
 * asks the read door once more, so the layout's own header is not shown to a
 * stranger. It does not hold the pages back: Next renders a page beside its
 * layout, not inside it, and an RSC request can skip the layout. What protects a
 * page, should the middleware ever be bypassed (another CVE-2025-29927 class bug,
 * or a matcher change), is projectDbPastDoor, which every page opens the database
 * with: it asks the same door, and the answer is shared within the request, so
 * this costs no second /authz call.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ project: string }>;
}) {
  const { project } = await params;
  await projectDbFor(project, { write: false });
  return (
    <>
      <SiteHeader project={project} />
      {children}
    </>
  );
}
