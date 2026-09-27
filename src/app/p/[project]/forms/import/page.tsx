import { permanentRedirect } from "next/navigation";

// The old form import read question files: that is the question-set import now (T62).
export default async function ImportFormPage({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params;
  permanentRedirect(`/p/${project}/question-sets/import`);
}
