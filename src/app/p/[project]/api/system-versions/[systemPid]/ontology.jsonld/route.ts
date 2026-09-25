import { NextResponse } from "next/server";
import { PROJECT_ID, projectDbForRoute } from "@/lib/projectDb";
import { QualificationRepository } from "@/server/repositories/QualificationRepository";
import { ontologyService } from "@/server/services/OntologyService";
import { knowledgeGraphStore } from "@/server/services/KnowledgeGraphStore";

/**
 * The AI card of one card version, as JSON-LD: what control objectives reads to
 * start an assessment of that version.
 *
 * `{project}` is the platform project pid and `{systemPid}` the card version
 * (a row of project.system in that project's own database). The caller must be
 * in the project; the card is looked up in the project's database, so a version
 * of another project is simply not found. The bytes are exactly those of
 * /p/{project}/api/qualifications/{id}/ontology.jsonld (the knowledge graph
 * store's).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ project: string; systemPid: string }> },
) {
  const { project, systemPid } = await params;
  if (!PROJECT_ID.test(systemPid)) return new NextResponse("Not found", { status: 404 });
  const db = await projectDbForRoute(project, { write: false });
  if (db instanceof Response) return db;

  const card = await new QualificationRepository(db).findBySystem(systemPid);
  if (!card) return new NextResponse("Not found", { status: 404 });

  try {
    const { document } = await knowledgeGraphStore.deliver(
      card.id,
      "jsonld",
      () => ontologyService.build(project, card.id),
      project,
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
