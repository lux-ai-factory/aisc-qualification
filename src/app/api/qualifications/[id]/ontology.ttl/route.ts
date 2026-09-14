import { NextResponse } from "next/server";
import { qualificationRepository } from "@/server/repositories/QualificationRepository";
import { ontologyService } from "@/server/services/OntologyService";
import { knowledgeGraphStore } from "@/server/services/KnowledgeGraphStore";
import { cardFileName } from "@/domain/SystemCard";

/** The same graph as Turtle, for anyone reading it by eye or loading it into a store. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const q = await qualificationRepository.cardSummary(id);
  if (!q) return new NextResponse("Not found", { status: 404 });

  try {
    // The kept bytes, so the file and the record are the same document rather
    // than two renderings of one set of triples, and so a system whose graph
    // exists stays downloadable while the builder is restarting.
    const { document, fromStore } = await knowledgeGraphStore.deliver(
      id,
      "turtle",
      () => ontologyService.build(id),
    );
    return new NextResponse(document, {
      headers: {
        "Content-Type": "text/turtle; charset=utf-8",
        "Content-Disposition": `attachment; filename="${cardFileName(q, "ontology.ttl")}"`,
        "Cache-Control": "no-store",
        // Says whether this is the graph as just built, or the one on record.
        "X-Knowledge-Graph": fromStore ? "stored" : "fresh",
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unavailable";
    return new NextResponse(`Could not produce the knowledge graph: ${detail}`, {
      status: 502,
    });
  }
}
