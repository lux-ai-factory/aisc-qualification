// Asks the filler service to draft the nodes that come from prose answers.
//
// Fire and forget: a run takes seconds to a minute, and waiting for it would
// hold the form submit open. The qualification is already stored by this point,
// so a filler that is down costs only an emptier first draft.
import { serviceTokenHeaders } from "@/server/services/http";

/** The ledger's run of one fill: its id, and the person's witnessed request. */
export type FillRun = { runId?: string | null; requestId?: string | null };

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
   * model it uses is still the one of the card's own project, which the app
   * tells it from that database. */
  async request(project: string, qualificationId: string, run: FillRun = {}): Promise<boolean> {
    if (!this.serviceUrl) return false; // no filler in this deployment
    try {
      // The run's id and the person's witnessed request travel with it, so the agent's ledger events
      // cite the run this app opened (card.ai_refinement_requested; spec 4.4).
      const headers: Record<string, string> = { ...serviceTokenHeaders(this.serviceToken) };
      if (run.runId) headers["X-AISC-Run-Id"] = run.runId;
      if (run.requestId) headers["X-AISC-Request-Id"] = run.requestId;
      const res = await this.fetchImpl(
        `${this.serviceUrl}/fill/${encodeURIComponent(project)}/${encodeURIComponent(qualificationId)}`,
        { method: "POST", headers, cache: "no-store" },
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}

/** Convenience for server actions. */
export async function requestFill(project: string, qualificationId: string, run: FillRun = {}): Promise<boolean> {
  return new FillerClient().request(project, qualificationId, run);
}
