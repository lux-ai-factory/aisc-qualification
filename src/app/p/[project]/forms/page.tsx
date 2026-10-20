import { permanentRedirect } from "next/navigation";

// Redirect for old form library links: forms are questionnaires.
export default async function FormsPage({
  params,
}: {
  params: Promise<{ project: string }>;
}) {
  const { project } = await params;
  permanentRedirect(`/p/${project}/questionnaires`);
}
