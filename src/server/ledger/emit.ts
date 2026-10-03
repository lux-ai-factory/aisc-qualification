/**
 * The app's ledger emitter (docs/superpowers/ledger-2026-10-02/02-spec.md 6.4, 6.5).
 *
 * An event is written with the project database's `ledger.emit(jsonb)` in the
 * SAME transaction as the change it describes, so a rollback leaves no event
 * and a committed change always has one (R2.4). The app never names who
 * acted: it cites the request the gateway witnessed (X-AISC-Request-Id), and
 * the platform's relay takes the person from that witness record. It sends
 * plain content; the platform computes every keyed digest (N4).
 *
 * Nothing is written while LEDGER_MODE is off (the default), so rows don't
 * pile up before the ledger is turned on.
 */
import { randomUUID } from "node:crypto";

import { ledgerSafe } from "./canonical";

export type LedgerEvent = {
  action: string;
  itemType: string;
  itemId: string | null;
  details?: Record<string, unknown>;
  content?: unknown;
  before?: unknown;
  after?: unknown;
  itemVersion?: string | number | null;
  runId?: string | null;
  /** The model behind an AI event (agent.*, card.augmented_by_ai). */
  model?: string | null;
  requestId?: string | null;
  eventId?: string;
};

/** Anything with Prisma's $executeRaw: the transaction client of `prisma.$transaction(async (tx) => ...)`. */
export type RawExecutor = {
  $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
};

export function ledgerOn(): boolean {
  const mode = (process.env.LEDGER_MODE ?? "off").trim().toLowerCase();
  return mode === "record" || mode === "enforce";
}

/** The request the gateway witnessed for the request being served, or null outside one. */
export async function currentRequestId(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    return (await headers()).get("x-aisc-request-id");
  } catch {
    return null; // not inside a request (a script, a test)
  }
}

/** The JSON the emitter writes; exported for the tests. Throws NotCanonical for a value the ledger can't keep. */
export function eventBody(event: LedgerEvent, requestId: string | null): string {
  const body: Record<string, unknown> = {
    event_id: event.eventId ?? randomUUID(),
    request_id: event.requestId ?? requestId,
    action: event.action,
    item_type: event.itemType,
    item_id: event.itemId,
    details: event.details ?? {},
  };
  if (event.content !== undefined) body.content = event.content;
  if (event.before !== undefined) body.before = event.before;
  if (event.after !== undefined) body.after = event.after;
  if (event.itemVersion !== undefined && event.itemVersion !== null) body.item_version = String(event.itemVersion);
  if (event.runId) body.run_id = event.runId;
  if (event.model) body.model = event.model;
  ledgerSafe(body); // refuse now, in the person's transaction, what the ledger would reject later
  return JSON.stringify(body);
}

/** Queue one event on `tx`, inside the caller's transaction. Returns its event id, or null while the ledger is off. */
export async function emitEvent(tx: RawExecutor, event: LedgerEvent): Promise<string | null> {
  if (!ledgerOn()) return null;
  const body = eventBody(event, await currentRequestId());
  await tx.$executeRaw`SELECT ledger.emit(${body}::jsonb)`;
  return JSON.parse(body).event_id as string;
}
