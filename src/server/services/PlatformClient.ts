/**
 * The platform: where a project and the system under assessment are named.
 *
 * One database, and one writer for what every module shares. This app describes
 * a system; the execution engine runs tests against it and the dashboard reports
 * on them, so all three must mean the same system. A project has one, in
 * versions (`core.ai_system_version`), which only the platform writes, and this
 * is how they are asked for. Each version has exactly one AI card, and
 * submitting it freezes the version.
 */
import { callerToken } from "@/server/services/callerToken";

export type SystemIdentity = {
  name: string;
  version?: string | null;
  provider?: string | null;
  description?: string | null;
};

/** A version of the project's one AI system, as the platform holds it. */
export type PlatformVersion = {
  pid: string;
  number: number;
  project_id: string;
  name: string;
  release: string | null;
  provider: string | null;
  description: string | null;
  frozen_at: string | null;
};

export type PlatformAISystem = {
  pid: string;
  project_id: string;
  current: PlatformVersion;
  versions: PlatformVersion[];
};

/** Who is calling, when there is a request to read it from. */
export type CallerToken = () => Promise<string | null>;

export class PlatformClient {
  constructor(
    private readonly baseUrl: string = process.env.PLATFORM_URL ?? "",
    private readonly fetchImpl: typeof fetch = fetch,
    /**
     * The platform asks who is calling: a project belongs to the people in it,
     * and naming a system inside one takes an editor. This app has no service
     * account and wants none, so it passes on the token of the person using it.
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
    const url = `${this.baseUrl.replace(/\/+$/, "")}${path}`;
    const token = await this.callerToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
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

  /** The project's one AI system: its current version and every one before. */
  aiSystem(project: string): Promise<PlatformAISystem> {
    return this.call("GET", `/projects/${encodeURIComponent(project)}/ai-system`);
  }

  /**
   * The version a new AI card will describe, with the system's identity as the
   * form gives it. A draft first (the next version, when the latest is frozen),
   * then the identity on that draft: the card is always about a version that
   * has none yet, even when nothing in the identity changed.
   */
  async versionForNewCard(project: string, system: SystemIdentity): Promise<PlatformVersion> {
    const where = `/projects/${encodeURIComponent(project)}/ai-system`;
    await this.call("POST", `${where}/draft`);
    const edited = await this.call<{ version: PlatformVersion }>("PATCH", where, {
      name: system.name,
      release: system.version ?? null,
      provider: system.provider ?? null,
      description: system.description ?? null,
    });
    return edited.version;
  }

  /** Something now depends on this version, so the platform keeps it as it is. */
  freeze(pid: string, reason: string): Promise<PlatformVersion> {
    return this.call("POST", `/ai-system-versions/${encodeURIComponent(pid)}/freeze`, { reason });
  }
}

export const platformClient = new PlatformClient(
  process.env.PLATFORM_URL ?? "",
  fetch,
  callerToken,
);
