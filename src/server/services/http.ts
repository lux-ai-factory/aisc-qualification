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

/** The header naming the platform project a call is about. */
export const PROJECT_HEADER = "X-AISC-Project";

/** How long a call waits for its answer unless the caller says otherwise. */
export const DEFAULT_TIMEOUT_MS = 30_000;

/** The longest reason from a service that is passed on to a person. */
const DETAIL_LIMIT = 300;

/**
 * What a call to a sibling service came to. `status` is null when no answer came (unreachable, or not
 * in time). `shownDetail` is the service's own reason, in one string short enough to show, or null when
 * it gave none: the caller then says what failed in its own words.
 */
export type ServiceAnswer<T> =
  | { ok: true; value: T }
  | { ok: false; status: number | null; shownDetail: string | null };

export type ServiceCall<T> = {
  base: string;
  path: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** the platform project the call is about, sent as X-AISC-Project */
  project?: string;
  /** this app's service token for that service */
  token?: string | null;
  /** FormData goes as it is; anything else as JSON */
  body?: unknown;
  timeoutMs?: number;
  /** the value of a 2xx answer's JSON, or undefined when it is not the shape the caller reads */
  parse: (raw: unknown) => T | undefined;
  fetchImpl?: typeof fetch;
};

const UNREADABLE = "the service gave an answer this could not read";

/** A service's `detail` as one string: FastAPI's validation list as "field: message; ...". */
function shownDetailOf(body: unknown): string | null {
  const detail = (body as { detail?: unknown } | null)?.detail;
  let text: string | null = null;
  if (typeof detail === "string") text = detail;
  else if (Array.isArray(detail)) {
    const parts = detail.map((item) => {
      const { loc, msg } = (item ?? {}) as { loc?: unknown; msg?: unknown };
      if (typeof msg !== "string") return null;
      // FastAPI's loc starts with where the field was: body, query, path
      const field = Array.isArray(loc) ? loc.slice(1).join(".") : "";
      return field ? `${field}: ${msg}` : msg;
    });
    const named = parts.filter((p): p is string => p !== null);
    text = named.length ? named.join("; ") : null;
  }
  if (!text) return null;
  return text.length > DETAIL_LIMIT ? `${text.slice(0, DETAIL_LIMIT - 3)}...` : text;
}

/** One call to a sibling service. It never throws: every failure is an answer with ok: false. */
export async function callService<T>(call: ServiceCall<T>): Promise<ServiceAnswer<T>> {
  const { base, path, method = "GET", project, token, body, parse } = call;
  const timeoutMs = call.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers: Record<string, string> = {
    ...(project ? { [PROJECT_HEADER]: project } : {}),
    ...serviceTokenHeaders(token),
  };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers["Content-Type"] = "application/json";
  }

  let res: Response;
  try {
    res = await (call.fetchImpl ?? fetch)(serviceUrl(base, path), {
      method,
      headers,
      body: payload,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const late = err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
    return {
      ok: false,
      status: null,
      shownDetail: late ? `the service did not answer within ${timeoutMs / 1000} s` : "the service could not be reached",
    };
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    return res.ok ? { ok: false, status: res.status, shownDetail: UNREADABLE } : { ok: false, status: res.status, shownDetail: null };
  }
  if (!res.ok) return { ok: false, status: res.status, shownDetail: shownDetailOf(raw) };
  let value: T | undefined;
  try {
    value = parse(raw);
  } catch {
    value = undefined;
  }
  return value === undefined ? { ok: false, status: res.status, shownDetail: UNREADABLE } : { ok: true, value };
}
