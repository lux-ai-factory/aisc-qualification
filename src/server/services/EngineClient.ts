/**
 * The execution engine, read on behalf of the person using this app.
 *
 * The card links the engine's real components; this is how they are listed, the
 * way the platform lists them (platform/platform_service/engine_components.py).
 * The engine keeps a project row of its own per platform project:
 * POST /api/v1/projects/for-platform/{pid} finds it (and makes it on an editor's
 * first visit), then GET /api/v1/projects/{enginePid}/aisystem reads its one AI
 * system. Both carry the caller's own token and the platform project in
 * X-AISC-Project, which the engine's door requires on every call
 * (apps/backend/aisc_backend/project_door.py), so a stranger or a viewer is
 * refused there and sees nothing.
 */
import { callerToken as defaultCallerToken, type CallerToken } from "@/server/services/callerToken";
import { bearerHeaders, serviceUrl } from "@/server/services/http";
import type { EngineComponent } from "@/domain/cardComponents";

/** The header naming the platform project a call to the engine is about. */
const PROJECT_HEADER = "X-AISC-Project";
/** How long one call to the engine may take, as the platform allows it. */
const TIMEOUT_MS = 20_000;
/** The engine's refusals that mean "nothing of this project for you": a viewer (403), a stranger (404). */
const REFUSED = new Set([403, 404]);

class Refused extends Error {}

export class EngineClient {
  constructor(
    private readonly baseUrl: string = process.env.AISC_BACKEND_URL ?? "",
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly callerToken: CallerToken = defaultCallerToken,
    private readonly timeoutMs: number = TIMEOUT_MS,
  ) {}

  private async call<T>(method: "GET" | "POST", path: string, project: string): Promise<T> {
    const headers = { ...bearerHeaders(await this.callerToken()), [PROJECT_HEADER]: project };
    let res: Response;
    try {
      res = await this.fetchImpl(serviceUrl(this.baseUrl, path), {
        method,
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      throw new Error("The engine did not answer", { cause });
    }
    if (REFUSED.has(res.status)) throw new Refused(`The engine answered ${res.status}`);
    if (!res.ok) throw new Error(`The engine answered ${res.status}`);
    return (await res.json()) as T;
  }

  /** The components of the engine project of this platform project; [] when the engine refuses the caller. */
  async components(platformProjectPid: string): Promise<EngineComponent[]> {
    let enginePid: string;
    try {
      ({ pid: enginePid } = await this.call<{ pid: string }>(
        "POST",
        `/api/v1/projects/for-platform/${encodeURIComponent(platformProjectPid)}`,
        platformProjectPid,
      ));
    } catch (err) {
      if (err instanceof Refused) return [];
      throw err;
    }
    const system = await this.call<{ components?: EngineComponent[] }>(
      "GET",
      `/api/v1/projects/${encodeURIComponent(enginePid)}/aisystem`,
      platformProjectPid,
    );
    return system.components ?? [];
  }
}

export const engineClient = new EngineClient();
