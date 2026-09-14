/**
 * Server-side audit forwarding for qualification.
 *
 * Posts to the aisc-backend /audit endpoint (the single immudb writer), forwarding the user's Keycloak
 * token; the server sets `action`/`resource_type`, and the backend stamps the verified `actor` +
 * `source_ip`. Best-effort — never throws (an audit failure must not break the user's action).
 */
const BACKEND_URL = process.env.AISC_BACKEND_URL || "http://localhost:8000";

export async function auditEvent(opts: {
  token?: string | null;
  action: string; // the verb: create | generate | ...
  resource_type: string; // the object type: qualification | systemcard | ...
  resource_id?: string | null;
  metadata?: Record<string, unknown>;
  outcome?: string;
}): Promise<void> {
  if (!opts.token) return;
  try {
    await fetch(`${BACKEND_URL}/api/v1/audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.token}` },
      body: JSON.stringify({
        action: opts.action,
        resource_type: opts.resource_type,
        resource_id: opts.resource_id ?? null,
        source_app: "qualification",
        metadata: opts.metadata ?? {},
        outcome: opts.outcome ?? "ok",
      }),
    });
  } catch (e) {
    console.warn("qualification audit forward failed:", e);
  }
}
