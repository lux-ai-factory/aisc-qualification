import { NextResponse } from "next/server";
import { qualificationRepository } from "@/server/repositories/QualificationRepository";
import {
  systemCardRendererClient,
  RendererHttpError,
  RendererUnreachableError,
} from "@/server/services/SystemCardRendererClient";
import { fileSlug } from "@/domain/SystemCard";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const q = await qualificationRepository.cardSummary(id);
  if (!q) return new NextResponse("Not found", { status: 404 });
  if (!q.systemCardJson) {
    return new NextResponse("No system card has been generated yet.", {
      status: 409,
    });
  }
  try {
    const pdf = await systemCardRendererClient.renderPdf(q.systemCardJson);
    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileSlug(q.systemName)}_v${q.systemVersion}_system_card.pdf"`,
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
