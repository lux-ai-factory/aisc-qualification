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
  /** The number of the version's latest card revision (1 until a correction is saved). */
  cardRevision: number;
};

/** Why a correction is made and who asked for it. */
export type Amendment = { reason: string; requestedBy: string };

/** The platform answered with a status that is not a success; `status` lets the caller tell refusals apart. */
export class PlatformStatusError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "PlatformStatusError";
  }
}

const READ_VERSIONS = "Could not read the AI card versions";

/** A card version as the platform answers it, or undefined when the answer is not one. */
function cardVersion(raw: unknown): CardVersion | undefined {
  const v = raw as Partial<CardVersion> | null;
  if (!v || typeof v !== "object") return undefined;
  if (typeof v.pid !== "string" || typeof v.number !== "number" || typeof v.name !== "string") return undefined;
  const raw_ = raw as { card_revision?: unknown };
  // an answer without card_revision is the platform of before corrections existed: revision 1
  const cardRevision = typeof raw_.card_revision === "number" ? raw_.card_revision : 1;
  return { ...(v as CardVersion), cardRevision };
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
    method: "GET" | "POST" | "PATCH",
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
    throw new PlatformStatusError(
      `${failed}: the platform answered ${answer.status}. ${answer.shownDetail ?? ""}`.trim(),
      answer.status,
    );
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

  /** Correct the description of the latest version, which stays the same version: the platform
   *  brings its name, version, provider and description up to date and counts one more card revision.
   *  `fromRevision` is the card revision the correction started from: when another correction came
   *  first, the platform refuses this one (409) instead of letting it silently replace that one. */
  reviseVersion(
    project: string,
    pid: string,
    identity: SystemIdentity,
    amend: Amendment,
    fromRevision: number,
  ): Promise<CardVersion> {
    return this.call(
      "Could not correct this system",
      "PATCH",
      `${this.versions(project)}/${encodeURIComponent(pid)}`,
      cardVersion,
      {
        name: identity.name,
        version: identity.version ?? null,
        provider: identity.provider ?? null,
        description: identity.description ?? null,
        reason: amend.reason,
        requested_by: amend.requestedBy,
        expected_card_revision: fromRevision,
      },
    );
  }
}

export const platformClient = new PlatformClient(
  process.env.PLATFORM_URL ?? "",
  fetch,
  callerToken,
);
