import { NextResponse } from "next/server";
import { qualificationRepository } from "@/server/repositories/QualificationRepository";
import { ontologyService } from "@/server/services/OntologyService";
import {
  systemCardRendererClient,
  RendererHttpError,
  RendererUnreachableError,
} from "@/server/services/SystemCardRendererClient";
import { cardFileName, systemCardPayload } from "@/domain/SystemCard";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const q = await qualificationRepository.cardSummary(id);
  if (!q) return new NextResponse("Not found", { status: 404 });
  // The filled graph IS the card, so the PDF is a rendering of it. There is no
  // prose path any more: the app makes no LLM calls at all, and the only model
  // in the system is the one the filler service configures through BAF.
  let ontology: unknown = undefined;
  try {
    ontology = (await ontologyService.build(id)).view;
  } catch {
    ontology = undefined;
  }
  if (!ontology) {
    return new NextResponse("The ontology service is not available.", {
      status: 502,
    });
  }

  const payload = systemCardPayload(q, null, ontology);

  try {
    const pdf = await systemCardRendererClient.renderPdf(payload);
    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${cardFileName(q, "ai_card.pdf")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof RendererUnreachableError) {
      return new NextResponse(err.message, { status: 502 });
    }
    if (err instanceof RendererHttpError) {
      return new NextResponse(err.message, { status: 502 });
    }
    throw err;
  }
}
