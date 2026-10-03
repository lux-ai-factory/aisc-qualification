import { permanentRedirect } from "next/navigation";

// Redirect for old "new form" links to the questionnaire builder, keeping ?from.
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
