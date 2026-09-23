/**
 * May this person be here, and may they change anything.
 *
 * The decision is not made in this app. A project belongs to the people in it,
 * and the platform is the one place that knows who: this asks it, and maps the
 * answer onto a status. Six modules each inventing their own idea of who may do
 * what is exactly what this is here to prevent.
 */
export type Access = {
  /** viewer, editor, owner, or null for somebody who is not in the project. */
  role: string | null;
  admin: boolean;
  may_write: boolean;
};

export type Verdict = "allow" | "not-found" | "forbidden" | "unavailable";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** The project a path is inside, or null if it is not inside one. */
export function projectFromPath(pathname: string): string | null {
  const match = /^\/p\/([^/]+)/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * What to do about a request, given what the platform said.
 *
 * `null` means the platform did not answer, and then nobody gets in: failing
 * open would turn an outage into an open door.
 */
export function decide(method: string, access: Access | null): Verdict {
  if (access === null) return "unavailable";
  // Not 403: the slug is the project's name, often a customer's, and 403 would
  // confirm it exists. A stranger is told what a stranger may know.
  if (!access.role) return "not-found";
  if (SAFE_METHODS.has(method.toUpperCase())) return "allow";
  // Every write in these apps is a server action, which is a POST to the page
  // it sits on, so this covers all of them without naming one.
  return access.may_write ? "allow" : "forbidden";
}

export async function fetchAccess(
  project: string,
  token: string | null,
  options: { platformUrl: string; fetchImpl?: typeof fetch },
): Promise<Access | null> {
  const platformUrl = options.platformUrl.replace(/\/+$/, "");
  if (!platformUrl) return null;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await (options.fetchImpl ?? fetch)(
      `${platformUrl}/authz/projects/${encodeURIComponent(project)}`,
      { headers, cache: "no-store" },
    );
    if (!response.ok) return null;
    return (await response.json()) as Access;
  } catch {
    return null;
  }
}
