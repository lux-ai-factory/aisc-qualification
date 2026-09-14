import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { qualificationRepository } from "@/server/repositories/QualificationRepository";
import { toExport } from "@/server/services/QualificationExporter";
import { ontologyService } from "@/server/services/OntologyService";
import { parseExtracted } from "@/server/forms/ExtractedParser";

// What the filler reads: the form in the same export shape the ontology service
// is given, plus whatever draft is already stored.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const q = await qualificationRepository.find(id);
  if (!q) return new NextResponse("Not found", { status: 404 });
  return NextResponse.json({
    ...toExport(q),
    extracted: q.ontologyExtracted ?? null,
  });
}

// Where the filler publishes its reviewed draft.
//
// PUT because a run replaces the whole draft, so re-running is idempotent.
// Reviewer corrections live in `ontologyPatch` and are applied after this at
// build time, so a re-run cannot overwrite an edit.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const exists = await qualificationRepository.cardSummary(id);
  if (!exists) return new NextResponse("Not found", { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body is not JSON." }, { status: 400 });
  }

  const parsed = parseExtracted(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  await qualificationRepository.saveOntologyExtracted(id, parsed.value);
  // Rebuild so the stored knowledge graph reflects this draft.
  try {
    await ontologyService.build(id);
  } catch {
    // The draft is stored; the next build will pick it up.
  }
  // The card is built on read, so the page has to be told its input changed.
  revalidatePath(`/qualify/${id}`);

  const counts = {
    techniques: parsed.value.techniques?.length ?? 0,
    components: parsed.value.components?.length ?? 0,
    flagged: Object.keys(parsed.value.flags ?? {}).length,
  };
  return NextResponse.json({ ok: true, ...counts });
}
