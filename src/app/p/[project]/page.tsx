import { redirect } from "next/navigation";

// The launcher's Qualify card opens /p/{project}. It goes straight to the AI system, which opens
// the latest AI card (its left menu) or, with no card yet, the form for the first one.
export default async function ProjectEntry({
  params,
}: {
  params: Promise<{ project: string }>;
}) {
  const { project } = await params;
  redirect(`/p/${project}/system`);
}
