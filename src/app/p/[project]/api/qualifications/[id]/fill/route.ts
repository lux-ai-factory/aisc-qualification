import { NextResponse } from "next/server";
import { callerAccess, projectDbForRoute } from "@/lib/projectDb";
import { QualificationRepository } from "@/server/repositories/QualificationRepository";
import { serviceTokenHeaders } from "@/server/services/http";

// The filler's run state, for the card to poll.
//
// Proxied because the filler is internal: reachable by service name inside the
// compose network, not from a browser. With no filler configured the answer is
// "idle".
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ project: string; id: string }> },
) {
  const { project, id } = await params;
  // Only a run state, but it still says whether this qualification exists and
  // what is happening to it. Same question as the routes beside it: the card
  // must be in this project's database, for a caller the platform lets read it.
  const db = await projectDbForRoute(project, { write: false });
  if (db instanceof Response) return db;
  if (!(await new QualificationRepository(db).cardSummary(id))) {
    return new NextResponse("Not found", { status: 404 });
  }
  const serviceUrl = process.env.AGENT_SERVICE_URL;
  if (!serviceUrl) return NextResponse.json({ state: "idle" });

  try {
    // The filler refuses a caller without this app's token for it.
    // Runs are kept per project and card.
    const res = await fetch(
      `${serviceUrl}/fill/${encodeURIComponent(project)}/${encodeURIComponent(id)}`,
      {
        headers: serviceTokenHeaders(
          process.env.QUALIFICATION_WEB_TO_AGENTS_TOKEN,
        ),
        cache: "no-store",
      },
    );
    if (res.status === 404) return NextResponse.json({ state: "idle" });
    if (!res.ok) return NextResponse.json({ state: "idle" });
    const body = await res.json();
    // A failed run's error text (short and cleaned by the agent) is for the people who can
    // act on it, as control-objectives shows a mapping run's error to editors and owners
    // only: a viewer, or a caller the platform does not describe, sees the state.
    if (body && typeof body === "object" && "error" in body) {
      const access = await callerAccess(project);
      if (!(access.ok && access.mayWrite)) delete (body as { error?: unknown }).error;
    }
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    // The filler is optional; the card is built from the form either way.
    return NextResponse.json({ state: "idle" });
  }
}
