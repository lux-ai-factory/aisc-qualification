/**
 * Server-side audit forwarding for qualification.
 *
 * Posts to the aisc-backend /audit endpoint (the single immudb writer), forwarding the user's Keycloak
 * token for the verified "who"; the server sets `what`. Best-effort — never throws (an audit failure
 * must not break the user's action).
 */
const BACKEND_URL = process.env.AISC_BACKEND_URL || "http://localhost:8000";

export async function auditEvent(opts: {
  token?: string | null;
  what: string;
  consequence?: Record<string, unknown>;
}): Promise<void> {
  if (!opts.token) return;
  try {
    await fetch(`${BACKEND_URL}/api/v1/audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.token}` },
      body: JSON.stringify({ what: opts.what, app: "qualification", consequence: opts.consequence ?? {} }),
    });
  } catch (e) {
    console.warn("qualification audit forward failed:", e);
  }
}
