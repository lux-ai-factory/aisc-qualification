import { NextResponse } from "next/server";
import { projectDbForRoute } from "@/lib/projectDb";
import { QualificationRepository } from "@/server/repositories/QualificationRepository";
import { emitEvent } from "@/server/ledger/emit";
import { ontologyService } from "@/server/services/OntologyService";
import {
  systemCardRendererClient,
  RendererHttpError,
  RendererUnreachableError,
} from "@/server/services/SystemCardRendererClient";
import { cardFileName, systemCardPayload } from "@/domain/SystemCard";

export async function GET(
  req: Request,
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
  // The filled graph IS the card, so the PDF is a rendering of it. There is no
  // prose path any more: the app makes no LLM calls at all, and the only model
  // in the system is the one the filler service configures through BAF.
  let ontology: unknown = undefined;
  try {
    ontology = (await ontologyService.build(project, id)).view;
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
    // A download is recorded (card.pdf_downloaded, ledger phase 5); a failure to record is logged only.
    const format = new URL(req.url).pathname.endsWith("system-card.pdf") ? "system-card.pdf" : "ai-card.pdf";
    await new QualificationRepository(db)
      .transaction((_r, tx) =>
        emitEvent(tx, { action: "card.pdf_downloaded", itemType: "qualification", itemId: id, details: { format } }),
      )
      .catch((e: unknown) => console.warn(`ledger: card.pdf_downloaded not recorded for ${id}: ${String(e)}`));
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
