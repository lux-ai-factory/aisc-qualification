/** Small pieces every call to a sibling service needs. */

/** `path` under a service's base URL, however many trailing slashes the base was configured with. */
export function serviceUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

/** The Authorization header that passes on a caller's token; none without one. */
export function bearerHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * The header a sidecar reads its caller's service token from, the same one the
 * platform's internal route reads. Every edge has a token of its own, so a
 * caller holds only the tokens of the services it calls.
 */
export const SERVICE_TOKEN_HEADER = "X-AISC-Service-Token";

/** The header that carries a service token; none without one, so the sidecar refuses honestly. */
export function serviceTokenHeaders(token: string | null | undefined): Record<string, string> {
  return token ? { [SERVICE_TOKEN_HEADER]: token } : {};
}
