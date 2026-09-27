/**
 * The person behind the request, as a token this app can pass on.
 *
 * Every page here is served behind the gateway, which holds the session and
 * copies the access token it has onto the request. When this app calls the
 * platform it does so on behalf of whoever is using it, not as itself: there is
 * no service account, and a project belongs to the people in it.
 *
 * Returns null outside a request (a script, a test), so the caller gets an
 * honest refusal from the platform rather than a header saying "Bearer
 * undefined".
 */
import { headers } from "next/headers";

/** What oauth2-proxy calls the token it holds, copied through by Caddy. */
export const GATEWAY_TOKEN_HEADER = "x-auth-request-access-token";

const BEARER = "bearer ";

/** Who is calling, when there is a request to read it from. */
export type CallerToken = () => Promise<string | null>;

/** The token on a request: its own Bearer header first, else the gateway's copy. */
export function tokenFromHeaders(incoming: { get(name: string): string | null }): string | null {
  const authorization = incoming.get("authorization") ?? "";
  if (authorization.toLowerCase().startsWith(BEARER)) {
    return authorization.slice(BEARER.length).trim() || null;
  }
  return incoming.get(GATEWAY_TOKEN_HEADER);
}

export async function callerToken(): Promise<string | null> {
  try {
    return tokenFromHeaders(await headers());
  } catch {
    return null;
  }
}
