import { NextResponse } from "next/server";
import { projectDbForRoute } from "@/lib/projectDb";
import { QualificationRepository } from "@/server/repositories/QualificationRepository";
import { ontologyService } from "@/server/services/OntologyService";
import { aiCardExport, cardFileName } from "@/domain/SystemCard";

/**
 * The card as JSON, losing nothing.
 *
 * `ai-card.pdf` renders the view for a reader and `ontology.jsonld` hands over
 * the graph for an RDF tool, but neither is the whole card in a form another
 * service can consume: the PDF is not machine-readable, and the graph does not
 * hold the AI Act citations, which the view computes. This is both, from the
 * same build the PDF uses, so the two cannot disagree.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ project: string; id: string }> },
) {
  const { project, id } = await params;
  // The card is looked up in this project's own database, after the platform
  // has said the caller may read the project: a card of another project is not
  // there, so it is 404 like a card that does not exist.
  const db = await projectDbForRoute(project, { write: false });
  if (db instanceof Response) return db;

  const q = await new QualificationRepository(db).cardSummary(id);
  if (!q) return new NextResponse("Not found", { status: 404 });

  let build;
  try {
    build = await ontologyService.build(project, id);
  } catch {
    build = null;
  }
  if (!build) {
    return new NextResponse("The ontology service is not available.", {
      status: 502,
    });
  }

  return new NextResponse(JSON.stringify(aiCardExport(q, build), null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${cardFileName(q, "ai_card.json")}"`,
      "Cache-Control": "no-store",
    },
  });
}
