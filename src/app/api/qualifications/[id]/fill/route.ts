import { NextResponse } from "next/server";
import { qualificationForCaller } from "@/server/access/qualificationAccess";

// The filler's run state, for the card to poll.
//
// Proxied because the filler is internal: reachable by service name inside the
// compose network, not from a browser. With no filler configured the answer is
// "idle".
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Only a run state, but it still says whether this qualification exists and
  // what is happening to it. Same question as the routes beside it.
  if (!(await qualificationForCaller(id))) {
    return new NextResponse("Not found", { status: 404 });
  }
  const serviceUrl = process.env.AGENT_SERVICE_URL;
  if (!serviceUrl) return NextResponse.json({ state: "idle" });

  try {
    const res = await fetch(`${serviceUrl}/fill/${id}`, { cache: "no-store" });
    if (res.status === 404) return NextResponse.json({ state: "idle" });
    if (!res.ok) return NextResponse.json({ state: "idle" });
    const body = await res.json();
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    // The filler is optional; the card is built from the form either way.
    return NextResponse.json({ state: "idle" });
  }
}
