import { permanentRedirect } from "next/navigation";

// Redirect for old "edit form" links: a form migrated to a questionnaire keeps its id.
export default async function EditFormPage({
  params,
}: {
  params: Promise<{ project: string; formId: string }>;
}) {
  const { project, formId } = await params;
  permanentRedirect(
    `/p/${project}/questionnaires/${encodeURIComponent(formId)}/edit`,
  );
}
