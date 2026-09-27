import { NextResponse } from "next/server";
import { projectDbForRoute, projectDbForService } from "@/lib/projectDb";
import { serviceCall } from "@/server/access/serviceToken";
import { revalidatePath } from "next/cache";
import { QualificationRepository } from "@/server/repositories/QualificationRepository";
import { toExport } from "@/server/services/QualificationExporter";
import { ontologyService } from "@/server/services/OntologyService";
import { parseExtracted } from "@/server/forms/ExtractedParser";
import { NOT_LATEST, isLatestCard } from "@/server/services/cardLatest";

/**
 * The card agent, when the request carries its token.
 *
 * The agent is a service with no user behind it, so it sends a token of its own
 * (QUALIFICATION_AGENTS_TO_WEB_TOKEN) and only these two routes accept it. Null
 * means no token was sent and the caller is a person; a response is the refusal.
 * It fails closed: a wrong token is 401, and an app with no token set is 503.
 */
function agentCall(req: Request): "agent" | Response | null {
  switch (serviceCall(req.headers, process.env.QUALIFICATION_AGENTS_TO_WEB_TOKEN)) {
    case "none":
      return null;
    case "valid":
      return "agent";
    case "wrong":
      return NextResponse.json({ error: "That service token is not the card agent's." }, { status: 401 });
    case "unset":
      return NextResponse.json(
        { error: "The card agent's token is not set here, so no service may call this." },
        { status: 503 },
      );
  }
}

/**
 * This project's database, for the agent (its token already checked: no
 * platform question, since the agent is nobody to the platform) or for a person
 * (the platform decides).
 */
function database(agent: "agent" | null, project: string, write: boolean) {
  return agent ? projectDbForService(project) : projectDbForRoute(project, { write });
}

// What the filler reads: the form in the same export shape the ontology service
// is given, plus whatever draft is already stored.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ project: string; id: string }> },
) {
  const { project, id } = await params;
  const agent = agentCall(req);
  if (agent instanceof Response) return agent;
  // The card is looked up in this project's own database. The agent's token
  // proves the caller, not the project: a card of another project is not in
  // this database, so it is 404 here.
  const db = await database(agent, project, false);
  if (db instanceof Response) return db;

  const q = await new QualificationRepository(db).find(id);
  if (!q) return new NextResponse("Not found", { status: 404 });
  return NextResponse.json({
    ...toExport(q),
    extracted: q.ontologyExtracted ?? null,
    // The filler takes its project from here, never from whoever started it, so
    // a run can only use the model and key of the project whose database holds
    // the card. It is the database's pid, never anything in the query string.
    projectId: project.toLowerCase(),
  });
}

// Where the filler publishes its reviewed draft.
//
// PUT because a run replaces the whole draft, so re-running is idempotent.
// Reviewer corrections live in `ontologyPatch` and are applied after this at
// build time, so a re-run cannot overwrite an edit.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ project: string; id: string }> },
) {
  const { project, id } = await params;
  const agent = agentCall(req);
  if (agent instanceof Response) return agent;
  // Writing the reviewed draft is changing somebody's card: a person needs to
  // be an editor of this project, a viewer is refused (403). The card must be
  // in this project's database.
  const db = await database(agent, project, true);
  if (db instanceof Response) return db;
  const repo = new QualificationRepository(db);

  const exists = await repo.cardSummary(id);
  if (!exists) return new NextResponse("Not found", { status: 404 });
  // Only the latest version's card changes: a draft for an older one is refused
  // before anything is read or written. The platform answers that for a person;
  // the agent has no user token, so the database's own rule answers for it.
  const latest = agent
    ? await repo.isLatest(exists.systemId)
    : await isLatestCard(project, exists.systemId);
  if (!latest) {
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

  await repo.saveOntologyExtracted(id, parsed.value);
  // Rebuild so the stored knowledge graph reflects this draft.
  try {
    await ontologyService.build(project, id);
  } catch {
    // The draft is stored; the next build will pick it up.
  }
  // The card is built on read, so the page has to be told its input changed.
  revalidatePath(`/p/${project}/qualify/${id}`);

  const counts = {
    techniques: parsed.value.techniques?.length ?? 0,
    components: parsed.value.components?.length ?? 0,
    flagged: Object.keys(parsed.value.flags ?? {}).length,
  };
  return NextResponse.json({ ok: true, ...counts });
}
