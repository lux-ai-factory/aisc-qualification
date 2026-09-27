import { permanentRedirect } from "next/navigation";

// The old form library: forms are questionnaires now (two-level forms, T62).
export default async function FormsPage({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params;
  permanentRedirect(`/p/${project}/questionnaires`);
}
