import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchAccess } from "@/server/access/projectAccess";
import { callerToken } from "@/server/services/callerToken";
import { ontologyService } from "@/server/services/OntologyService";
import { knowledgeGraphStore } from "@/server/services/KnowledgeGraphStore";

/**
 * The AI card of one card version, as JSON-LD: what control objectives reads to
 * start an assessment of that version.
 *
 * `{project}` is the platform project pid and `{systemPid}` the card version
 * (a row of core.system). The caller must be in the project; the card must be
 * of that project. The bytes are exactly those of
 * /api/qualifications/{id}/ontology.jsonld (the knowledge graph store's).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ project: string; systemPid: string }> },
) {
  const { project, systemPid } = await params;
  const access = await fetchAccess(project, await callerToken(), {
    platformUrl: process.env.PLATFORM_URL ?? "",
  });
  if (!access?.role) return new NextResponse("Not found", { status: 404 });

  const card = await prisma.qualification.findUnique({
    where: { systemId: systemPid },
    select: { id: true, projectId: true, systemId: true, systemName: true, systemVersion: true },
  });
  if (!card || card.projectId !== project) return new NextResponse("Not found", { status: 404 });

  try {
    const { document } = await knowledgeGraphStore.deliver(card.id, "jsonld", () =>
      ontologyService.build(card.projectId, card.id),
    );
    return new NextResponse(document, {
      headers: {
        "Content-Type": "application/ld+json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unavailable";
    return new NextResponse(`Could not produce the knowledge graph: ${detail}`, { status: 502 });
  }
}
