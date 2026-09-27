import { permanentRedirect } from "next/navigation";

// The old "edit form" page: a migrated questionnaire keeps its form's id (D1, T62).
export default async function EditFormPage({
  params,
}: {
  params: Promise<{ project: string; formId: string }>;
}) {
  const { project, formId } = await params;
  permanentRedirect(`/p/${project}/questionnaires/${encodeURIComponent(formId)}/edit`);
}
