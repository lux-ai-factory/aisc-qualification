/**
 * The execution engine, read on behalf of the person using this app.
 *
 * The card links the engine's real components; this is how they are listed.
 * Read only: the engine project is found by its platform project pid, then its
 * one AI system is read, both with the caller's own token, so a stranger to the
 * project sees nothing (the engine lists no project for them).
 */
import { callerToken as defaultCallerToken } from "@/server/services/callerToken";
import type { EngineComponent } from "@/domain/cardComponents";

export class EngineClient {
  constructor(
    private readonly baseUrl: string = process.env.AISC_BACKEND_URL ?? "",
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly callerToken: () => Promise<string | null> = defaultCallerToken,
  ) {}

  private async get<T>(path: string): Promise<T> {
    const token = await this.callerToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl.replace(/\/+$/, "")}${path}`, {
        headers,
        cache: "no-store",
      });
    } catch (cause) {
      throw new Error("The engine did not answer", { cause });
    }
    if (!res.ok) throw new Error(`The engine answered ${res.status}`);
    return (await res.json()) as T;
  }

  /** The components of the engine project linked to this platform project; [] when there is none. */
  async components(platformProjectPid: string): Promise<EngineComponent[]> {
    const projects = await this.get<{ pid: string }[]>(
      `/api/v1/projects?platform_project_id=${encodeURIComponent(platformProjectPid)}`,
    );
    if (!projects.length) return [];
    const system = await this.get<{ components?: EngineComponent[] }>(
      `/api/v1/projects/${projects[0].pid}/aisystem`,
    );
    return system.components ?? [];
  }
}

export const engineClient = new EngineClient();
