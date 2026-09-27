import { redirect } from "next/navigation";

// There is no new qualification to make: a project has one AI system, edited
// and versioned. This address is kept so old links land on editing it.
export default async function OldNewQualificationPage({
  params,
}: {
  params: Promise<{ project: string }>;
}) {
  const { project } = await params;
  redirect(`/p/${project}/system/edit`);
}
