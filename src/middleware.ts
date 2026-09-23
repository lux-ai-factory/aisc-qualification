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

import { decide, fetchAccess, projectFromPath } from "@/server/access/projectAccess";
import { GATEWAY_TOKEN_HEADER } from "@/server/services/callerToken";

export const config = {
  // Only the pages that are inside a project. The methodology, the health
  // check and the static assets are not, and have nothing project-specific on
  // them.
  matcher: ["/p/:path*"],
};

export async function middleware(request: NextRequest) {
  const project = projectFromPath(request.nextUrl.pathname);
  if (!project) return NextResponse.next();

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : request.headers.get(GATEWAY_TOKEN_HEADER);

  const access = await fetchAccess(project, token || null, {
    platformUrl: process.env.PLATFORM_URL ?? "",
  });

  switch (decide(request.method, access)) {
    case "allow":
      return NextResponse.next();
    case "not-found":
      return new NextResponse("No such project.", { status: 404 });
    case "forbidden":
      return new NextResponse("You can read this project but not change it.", { status: 403 });
    case "unavailable":
      return new NextResponse("The platform is not answering, so who may be here cannot be established.", {
        status: 503,
      });
  }
}
