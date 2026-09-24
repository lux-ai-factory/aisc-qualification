/** Small pieces every call to a sibling service needs. */

/** `path` under a service's base URL, however many trailing slashes the base was configured with. */
export function serviceUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

/** The Authorization header that passes on a caller's token; none without one. */
export function bearerHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
