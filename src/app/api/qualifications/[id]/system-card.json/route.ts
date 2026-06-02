import { NextResponse } from "next/server";
import { qualificationRepository } from "@/server/repositories/QualificationRepository";
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
  return new NextResponse(JSON.stringify(q.systemCardJson, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileSlug(q.systemName)}_v${q.systemVersion}_system_card.json"`,
      "Cache-Control": "no-store",
    },
  });
}
