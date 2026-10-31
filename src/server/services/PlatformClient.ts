/**
 * The platform: where a project and the versions of its AI card are kept.
 *
 * One database, and one writer for what every module shares. A project has one
 * AI system; what is versioned is its AI card, the system's description. Each
 * saved card version is a row of `project.system` in the project's database,
 * numbered 1, 2, ... per project, which only the platform writes; this is how they are made and read. Only the
 * latest version may change; the older ones are kept as they were.
 */
import { callerToken, type CallerToken } from "@/server/services/callerToken";
import { currentRequestId } from "@/vendor/aisc-ledger/emit";
import { bearerHeaders, callService } from "@/server/services/http";

export type SystemIdentity = {
  name: string;
  version?: string | null;
  provider?: string | null;
  description?: string | null;
};

/** A saved AI card version: a row of project.system in the project's database, as the platform returns it. */
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

const READ_VERSIONS = "Could not read the AI card versions";

/** A card version as the platform answers it, or undefined when the answer is not one. */
function cardVersion(raw: unknown): CardVersion | undefined {
  const v = raw as Partial<CardVersion> | null;
  if (!v || typeof v !== "object") return undefined;
  if (typeof v.pid !== "string" || typeof v.number !== "number" || typeof v.name !== "string") return undefined;
  return v as CardVersion;
}

/** The latest version, or null when the project has none yet. */
const latestOrNone = (raw: unknown): CardVersion | null | undefined => (raw === null ? null : cardVersion(raw));

/** Every version, when each item is one. */
function cardVersions(raw: unknown): CardVersion[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const versions = raw.map(cardVersion);
  return versions.every((v) => v !== undefined) ? (versions as CardVersion[]) : undefined;
}

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

  /** A call to the platform as the person using this app. A failure's message starts with
   *  `failed`, what the person was doing, since it reaches them as it is. */
  private async call<T>(
    failed: string,
    method: "GET" | "POST",
    path: string,
    parse: (raw: unknown) => T | undefined,
    body?: unknown,
  ): Promise<T> {
    if (!this.baseUrl) {
      throw new Error(
        "PLATFORM_URL is not set: this app cannot name the system it is qualifying.",
      );
    }
    // The request the gateway witnessed for this person is passed on, so the platform's own event (a card
    // version, a target sync) cites it; with the ledger in `enforce` mode the platform needs it to accept the write.
    const requestId = await currentRequestId();
    const answer = await callService({
      base: this.baseUrl,
      path,
      method,
      headers: {
        ...bearerHeaders(await this.callerToken()),
        ...(requestId ? { "X-AISC-Request-Id": requestId } : {}),
      },
      body,
      parse,
      fetchImpl: this.fetchImpl,
    });
    if (answer.ok) return answer.value;
    // The person reads this: the platform's own detail when it gives one, on one short line.
    if (answer.status === null) throw new Error(`${failed}: the platform did not answer.`);
    if (answer.status < 300) throw new Error(`${failed}: the platform gave an answer this could not read.`);
    throw new Error(`${failed}: the platform answered ${answer.status}. ${answer.shownDetail ?? ""}`.trim());
  }

  private versions(project: string): string {
    return `/projects/${encodeURIComponent(project)}/system-versions`;
  }

  /** The project's latest saved card version, or null when it has none yet. */
  latestVersion(project: string): Promise<CardVersion | null> {
    return this.call(READ_VERSIONS, "GET", `${this.versions(project)}/latest`, latestOrNone);
  }

  /** Every saved card version of the project, highest number first. */
  listVersions(project: string): Promise<CardVersion[]> {
    return this.call(READ_VERSIONS, "GET", this.versions(project), cardVersions);
  }

  /** The card's components may have changed: the platform brings the project's assessment
   *  targets up to date. The caller treats a failure as best-effort. */
  async syncTargets(project: string): Promise<void> {
    await this.call(
      "Could not update the assessment targets",
      "POST",
      `/projects/${encodeURIComponent(project)}/targets/sync`,
      () => null,
      {},
    );
  }

  /** Save the next card version, with the system's identity as the form gives it. */
  createVersion(project: string, identity: SystemIdentity): Promise<CardVersion> {
    return this.call("Could not name this system", "POST", this.versions(project), cardVersion, {
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
