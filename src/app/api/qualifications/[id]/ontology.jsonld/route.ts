import { NextResponse } from "next/server";
import { qualificationRepository } from "@/server/repositories/QualificationRepository";
import { ontologyService } from "@/server/services/OntologyService";
import { knowledgeGraphStore } from "@/server/services/KnowledgeGraphStore";
import { cardFileName } from "@/domain/SystemCard";

/**
 * The filled AIRO graph as JSON-LD.
 *
 * This is the download that reconstructs the ontology: parsing it back yields a
 * triple-for-triple identical graph, including the VAIR types and any reviewer
 * corrections (see services/ontology/tests/test_roundtrip.py).
 */
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
      "jsonld",
      () => ontologyService.build(id),
    );
    return new NextResponse(document, {
      headers: {
        "Content-Type": "application/ld+json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${cardFileName(q, "ontology.jsonld")}"`,
        "Cache-Control": "no-store",
        // Says whether this is the graph as just built, or the one on record.
        "X-Knowledge-Graph": fromStore ? "stored" : "fresh",
      },
    });
  } catch (err) {
    // The ontology service is a separate process; say so rather than 500.
    const detail = err instanceof Error ? err.message : "unavailable";
    return new NextResponse(`Could not produce the knowledge graph: ${detail}`, {
      status: 502,
    });
  }
}
