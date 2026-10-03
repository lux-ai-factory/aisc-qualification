/**
 * The platform: where a project and the versions of its AI card are kept.
 *
 * One database, and one writer for what every module shares. A project has one
 * AI system; what is versioned is its AI card, the system's description. Each
 * saved card version is a row of `core.system`, numbered 1, 2, ... per project,
 * which only the platform writes; this is how they are made and read. Only the
 * latest version may change; the older ones are kept as they were.
 */
import { callerToken, type CallerToken } from "@/server/services/callerToken";
import { currentRequestId } from "@/server/ledger/emit";
import { bearerHeaders, serviceUrl } from "@/server/services/http";

export type SystemIdentity = {
  name: string;
  version?: string | null;
  provider?: string | null;
  description?: string | null;
};

/** A saved AI card version: a row of core.system, as the platform returns it. */
export type CardVersion = {
  pid: string;
  project_id: string;
  number: number;
  name: string;
  version: string | null;
  provider: string | null;
  description: string | null;
  created_at: string;
  created_by: string | null;
};

export class PlatformClient {
  constructor(
    private readonly baseUrl: string = process.env.PLATFORM_URL ?? "",
    private readonly fetchImpl: typeof fetch = fetch,
    /**
     * The platform asks who is calling: a project belongs to the people in it,
     * and saving a card version inside one takes an editor. This app has no
     * service account and wants none, so it passes on the token of the person
     * using it.
     */
    private readonly callerToken: CallerToken = async () => null,
  ) {}

  /** A call to the platform as the person using this app. */
  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.baseUrl) {
      throw new Error(
        "PLATFORM_URL is not set: this app cannot name the system it is qualifying.",
      );
    }
    // The request the gateway witnessed for this person travels on, so the platform's own event (a card
    // version, a target sync) cites it, and in `enforce` the platform accepts the write (spec 4.3).
    const requestId = await currentRequestId();
    const headers = {
      "Content-Type": "application/json",
      ...bearerHeaders(await this.callerToken()),
      ...(requestId ? { "X-AISC-Request-Id": requestId } : {}),
    };
    let res: Response;
    try {
      res = await this.fetchImpl(serviceUrl(this.baseUrl, path), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      });
    } catch (cause) {
      throw new Error(`Could not name this system: the platform did not answer.`, { cause });
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Could not name this system: the platform answered ${res.status}. ${detail}`.trim(),
      );
    }
    return (await res.json()) as T;
  }

  private versions(project: string): string {
    return `/projects/${encodeURIComponent(project)}/system-versions`;
  }

  /** The project's latest saved card version, or null when it has none yet. */
  latestVersion(project: string): Promise<CardVersion | null> {
    return this.call("GET", `${this.versions(project)}/latest`);
  }

  /** Every saved card version of the project, highest number first. */
  listVersions(project: string): Promise<CardVersion[]> {
    return this.call("GET", this.versions(project));
  }

  /** The card's components may have changed: the platform brings the project's assessment
   *  targets up to date (targets plan v2, O4). The caller treats a failure as best-effort. */
  async syncTargets(project: string): Promise<void> {
    await this.call("POST", `/projects/${encodeURIComponent(project)}/targets/sync`, {});
  }

  /** Save the next card version, with the system's identity as the form gives it. */
  createVersion(project: string, identity: SystemIdentity): Promise<CardVersion> {
    return this.call("POST", this.versions(project), {
      name: identity.name,
      version: identity.version ?? null,
      provider: identity.provider ?? null,
      description: identity.description ?? null,
    });
  }
}

export const platformClient = new PlatformClient(
  process.env.PLATFORM_URL ?? "",
  fetch,
  callerToken,
);
