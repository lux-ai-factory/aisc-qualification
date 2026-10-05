/**
 * The door to a project's pages.
 *
 * Signing in is the gateway's job and has already happened by the time a
 * request arrives here. This answers the other question: is this person in this
 * project, and are they allowed to change it. The platform decides; this asks
 * it once per request and turns the answer into a status.
 *
 * It covers server actions without naming any of them, because an action is a
 * POST to the page it sits on.
 */
import { NextResponse, type NextRequest } from "next/server";

import {
  decide,
  fetchAccess,
  isProjectId,
  projectFromPath,
} from "@/server/access/projectAccess";
import { tokenFromHeaders } from "@/server/services/callerToken";
import { SERVICE_TOKEN_HEADER } from "@/server/services/http";

export const config = {
  // Only the pages that are inside a project. The methodology, the health
  // check and the static assets are not, and have nothing project-specific on
  // them.
  matcher: ["/p/:path*"],
};

/**
 * The one route a service may reach without a person: the card agent reads and
 * publishes a card's extracted document with its own token. The route itself
 * checks that token (in constant time, which the edge runtime here cannot);
 * this only leaves it to the route when the agent's header is there.
 */
const AGENT_ROUTE = /^\/p\/[^/]+\/api\/qualifications\/[^/]+\/extracted\/?$/;
const AGENT_METHODS = new Set(["GET", "PUT"]);

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const project = projectFromPath(pathname);
  if (project === null) return NextResponse.next();
  // Only a pid names a project (and its database): anything else is not found,
  // and the platform is not asked about it.
  if (!isProjectId(project))
    return new NextResponse("No such project.", { status: 404 });
  if (
    AGENT_ROUTE.test(pathname) &&
    AGENT_METHODS.has(request.method.toUpperCase()) &&
    request.headers.get(SERVICE_TOKEN_HEADER) !== null
  ) {
    return NextResponse.next();
  }

  const access = await fetchAccess(
    project,
    tokenFromHeaders(request.headers) || null,
    {
      platformUrl: process.env.PLATFORM_URL ?? "",
    },
  );

  switch (decide(request.method, access)) {
    case "allow":
      return NextResponse.next();
    case "not-found":
      return new NextResponse("No such project.", { status: 404 });
    case "forbidden":
      return new NextResponse("You can read this project but not change it.", {
        status: 403,
      });
    case "unavailable":
      return new NextResponse(
        "The platform is not answering, so who may be here cannot be established.",
        {
          status: 503,
        },
      );
  }
}
