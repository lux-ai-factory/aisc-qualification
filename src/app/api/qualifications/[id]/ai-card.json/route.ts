import { NextResponse } from "next/server";
import { qualificationRepository } from "@/server/repositories/QualificationRepository";
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
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const q = await qualificationRepository.cardSummary(id);
  if (!q) return new NextResponse("Not found", { status: 404 });

  let build;
  try {
    build = await ontologyService.build(id);
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
