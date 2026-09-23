/**
 * The platform: where a project and the system under assessment are named.
 *
 * One database, and one writer for what every module shares. This app describes
 * a system; the execution engine runs tests against it and the dashboard reports
 * on them, so all three must mean the same system. That name lives in
 * `core.system`, which only the platform writes, and this is how it is asked
 * for. Registering is idempotent: the same name and version in the same project
 * is the same system, so callers may ask every time rather than remembering.
 */
import { callerToken } from "@/server/services/callerToken";

export type SystemIdentity = {
  name: string;
  version?: string | null;
  provider?: string | null;
  description?: string | null;
};

export type PlatformSystem = {
  pid: string;
  project_id: string;
  name: string;
  version: string | null;
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

  async registerSystem(project: string, system: SystemIdentity): Promise<PlatformSystem> {
    if (!this.baseUrl) {
      throw new Error(
        "PLATFORM_URL is not set: this app cannot name the system it is qualifying.",
      );
    }
    const url = `${this.baseUrl.replace(/\/+$/, "")}/projects/${encodeURIComponent(project)}/systems`;
    const token = await this.callerToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify(system),
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
    return (await res.json()) as PlatformSystem;
  }
}

export const platformClient = new PlatformClient(
  process.env.PLATFORM_URL ?? "",
  fetch,
  callerToken,
);
