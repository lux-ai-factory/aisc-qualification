// Asks the filler service to draft the nodes that come from prose answers.
//
// Fire and forget: a run takes seconds to a minute, and waiting for it would
// hold the form submit open. The qualification is already stored by this point,
// so a filler that is down costs only an emptier first draft.
import { callService } from "@/server/services/http";

/** The ledger's run of one fill: its id, and the person's witnessed request. */
export type FillRun = { runId?: string | null; requestId?: string | null };

/** The filler answers at once (a run goes on in the background): a call waits this long. */
const FILLER_TIMEOUT_MS = 10_000;

const fillPath = (project: string, qualificationId: string) =>
  `/fill/${encodeURIComponent(project)}/${encodeURIComponent(qualificationId)}`;

export class FillerClient {
  constructor(
    private readonly serviceUrl: string = process.env.AGENT_SERVICE_URL ?? "",
    private readonly fetchImpl: typeof fetch = fetch,
    /** This app's token for the filler: it refuses a caller without one. */
    private readonly serviceToken: string = process.env.QUALIFICATION_WEB_TO_AGENTS_TOKEN ?? "",
  ) {}

  /** True when the filler accepted the request. Never throws.
   *
   * The project says which project database the filler reads the card from; the
   * model it uses is the one configured for that project, which the app reads
   * from that database. */
  async request(project: string, qualificationId: string, run: FillRun = {}): Promise<boolean> {
    if (!this.serviceUrl) return false; // no filler in this deployment
    // The run's id and the person's witnessed request travel with it, so the agent's ledger events
    // cite the run this app opened (the card.ai_refinement_requested event).
    const headers: Record<string, string> = {};
    if (run.runId) headers["X-AISC-Run-Id"] = run.runId;
    if (run.requestId) headers["X-AISC-Request-Id"] = run.requestId;
    const answer = await callService({
      base: this.serviceUrl,
      path: fillPath(project, qualificationId),
      method: "POST",
      token: this.serviceToken,
      headers,
      timeoutMs: FILLER_TIMEOUT_MS,
      parse: () => true,
      fetchImpl: this.fetchImpl,
    });
    // Any 2xx took the run, whatever its body says.
    return answer.ok || (answer.status !== null && answer.status < 300);
  }

  /** True when the filler has a run of this card queued or running. False when it has none, or does
   *  not answer: the request that follows then says whether it took the run. Never throws. */
  async inFlight(project: string, qualificationId: string): Promise<boolean> {
    if (!this.serviceUrl) return false;
    const answer = await callService({
      base: this.serviceUrl,
      path: fillPath(project, qualificationId),
      token: this.serviceToken,
      timeoutMs: FILLER_TIMEOUT_MS,
      parse: (raw) => (raw && typeof raw === "object" ? (raw as { state?: unknown }).state : undefined),
      fetchImpl: this.fetchImpl,
    });
    return answer.ok && (answer.value === "queued" || answer.value === "running");
  }
}

/** Whether a fill of this card is going, with a default client, for server actions. */
export async function fillInFlight(project: string, qualificationId: string): Promise<boolean> {
  return new FillerClient().inFlight(project, qualificationId);
}

/** Request a fill with a default client, for server actions. */
export async function requestFill(project: string, qualificationId: string, run: FillRun = {}): Promise<boolean> {
  return new FillerClient().request(project, qualificationId, run);
}
