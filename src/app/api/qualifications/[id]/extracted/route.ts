import { NextResponse } from "next/server";
import { qualificationForCaller } from "@/server/access/qualificationAccess";
import { revalidatePath } from "next/cache";
import { qualificationRepository } from "@/server/repositories/QualificationRepository";
import { toExport } from "@/server/services/QualificationExporter";
import { ontologyService } from "@/server/services/OntologyService";
import { parseExtracted } from "@/server/forms/ExtractedParser";
import { NOT_LATEST, isLatestCard } from "@/server/services/cardLatest";

// What the filler reads: the form in the same export shape the ontology service
// is given, plus whatever draft is already stored.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // The path carries no project, so access is checked against the
  // qualification's own project.
  const project = await qualificationForCaller(id);
  if (!project) return new NextResponse("Not found", { status: 404 });

  const q = await qualificationRepository.find(project, id);
  if (!q) return new NextResponse("Not found", { status: 404 });
  return NextResponse.json({
    ...toExport(q),
    extracted: q.ontologyExtracted ?? null,
    // The filler takes its project from here, never from whoever started it, so a
    // run can only use the model and key of the qualification's own project.
    projectId: project,
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
  // Writing the reviewed draft is changing somebody's card, so the same
  // question is asked here as on the read above.
  const project = await qualificationForCaller(id);
  if (!project) return new NextResponse("Not found", { status: 404 });

  const exists = await qualificationRepository.cardSummary(project, id);
  if (!exists) return new NextResponse("Not found", { status: 404 });
  // Only the latest version's card changes: a draft for an older one is refused
  // before anything is read or written.
  if (!(await isLatestCard(project, exists.systemId))) {
    return NextResponse.json({ error: NOT_LATEST }, { status: 403 });
  }

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
    await ontologyService.build(project, id);
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
