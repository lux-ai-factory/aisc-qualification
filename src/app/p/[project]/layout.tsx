import SiteHeader from "@/components/SiteHeader";

/** Everything under here is one project's: the header links stay inside it. */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ project: string }>;
}) {
  const { project } = await params;
  return (
    <>
      <SiteHeader project={project} />
      {children}
    </>
  );
}
