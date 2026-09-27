import { permanentRedirect } from "next/navigation";

// The old "new form" page: the questionnaire builder now (T62). ?from is kept.
export default async function NewFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ project: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { project } = await params;
  const { from } = await searchParams;
  const query = from ? `?from=${encodeURIComponent(from)}` : "";
  permanentRedirect(`/p/${project}/questionnaires/new${query}`);
}
