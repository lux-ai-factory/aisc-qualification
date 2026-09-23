import { redirect } from "next/navigation";
import { qualificationService } from "@/server/services/QualificationService";

// The project's one AI system is its current AI card (the newest version that
// has one). Until there is one, the system's page is describing it.
export default async function SystemPage({
  params,
}: {
  params: Promise<{ project: string }>;
}) {
  const { project } = await params;
  const current = await qualificationService.currentCardId(project).catch(() => null);
  redirect(current ? `/p/${project}/qualify/${current}` : `/p/${project}/system/edit`);
}
