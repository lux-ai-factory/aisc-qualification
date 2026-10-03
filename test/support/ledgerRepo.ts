// Ledger phase 5: a fake repository's transaction. The card actions run a change, its history row and
// its ledger event in `repo.transaction`; a fake runs them on a transaction client that records the
// emitter's SQL, so unit tests can see what was emitted (the real database is test/db/ledger.db.test.ts).
import { vi } from "vitest";

export function fakeTx() {
  const calls: unknown[][] = [];
  return { calls, $executeRaw: vi.fn(async (...args: unknown[]) => (calls.push(args), 1)) };
}

type Repoish = Record<string, unknown>;

/** `repo` with `transaction` and the history methods, keeping any the test defined itself. */
export function transactional<T extends Repoish>(repo: T, tx = fakeTx()) {
  const out = repo as Repoish;
  out.transaction ??= async (fn: (r: unknown, t: unknown) => unknown) => fn(out, tx);
  out.recordHistory ??= vi.fn(async () => undefined);
  out.findLink ??= vi.fn(async () => null);
  out.ontologyState ??= vi.fn(async () => ({ ontologyPatch: null, ontologyExtracted: null }));
  return Object.assign(out, { ledgerTx: tx }) as T & { ledgerTx: ReturnType<typeof fakeTx> };
}
