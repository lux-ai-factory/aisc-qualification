// Asks the filler service to draft the nodes that come from prose answers.
//
// Fire and forget: a run takes seconds to a minute, and waiting for it would
// hold the form submit open. The qualification is already stored by this point,
// so a filler that is down costs only an emptier first draft.
export class FillerClient {
  constructor(
    private readonly serviceUrl: string = process.env.AGENT_SERVICE_URL ?? "",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** True when the filler accepted the request. Never throws. */
  async request(qualificationId: string): Promise<boolean> {
    if (!this.serviceUrl) return false; // no filler in this deployment
    try {
      const res = await this.fetchImpl(
        `${this.serviceUrl}/fill/${qualificationId}`,
        { method: "POST", cache: "no-store" },
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}

/** Convenience for server actions. */
export async function requestFill(qualificationId: string): Promise<boolean> {
  return new FillerClient().request(qualificationId);
}
