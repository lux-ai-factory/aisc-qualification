import { NextResponse } from "next/server";

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
