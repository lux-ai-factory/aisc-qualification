/**
 * May this person be here, and may they change anything.
 *
 * The decision is not made in this app. A project belongs to the people in it,
 * and the platform is the one place that knows who: this asks it, and maps the
 * answer onto a status, so no module keeps its own idea of who may do what.
 */
import { bearerHeaders } from "@/server/services/http";

export type Access = {
  /** viewer, editor, owner, or null for somebody who is not in the project. */
  role: string | null;
  admin: boolean;
  may_write: boolean;
};

export type Verdict = "allow" | "not-found" | "forbidden" | "unavailable";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * A project id (pid): a UUID, which is what names a project's database. Only a
 * pid is a project here; a slug or anything else is "not found".
 */
export const PROJECT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isProjectId = (x: string): boolean => PROJECT_ID.test(x);

/** The project a path is inside, or null if it is not inside one. A malformed
 *  escape is returned as it is, so the pid check answers it (404), not a crash. */
export function projectFromPath(pathname: string): string | null {
  const match = /^\/p\/([^/]+)/.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * What to do about a request, given what the platform said.
 *
 * `null` means the platform did not answer, and then nobody gets in: failing
 * open would turn an outage into an open door.
 */
export function decide(method: string, access: Access | null): Verdict {
  if (access === null) return "unavailable";
  // Not 403: a 403 would confirm that the project exists. A stranger is told
  // only what a stranger may know.
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
  try {
    const response = await (options.fetchImpl ?? fetch)(
      `${platformUrl}/authz/projects/${encodeURIComponent(project)}`,
      { headers: bearerHeaders(token), cache: "no-store" },
    );
    if (!response.ok) return null;
    return (await response.json()) as Access;
  } catch {
    return null;
  }
}

/** What a refused write is told, by status: the same words as the door above. */
export const REFUSED = {
  403: "403: you can read this project but not change it.",
  404: "Qualification not found.",
} as const;
