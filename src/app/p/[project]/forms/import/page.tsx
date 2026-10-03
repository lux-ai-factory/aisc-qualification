import { permanentRedirect } from "next/navigation";

// Redirect for old form import links: reading question files is the question-set import.
export default async function ImportFormPage({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params;
  permanentRedirect(`/p/${project}/question-sets/import`);
}
