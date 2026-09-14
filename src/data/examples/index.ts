import { MCAS } from "./mcas";
import type { FormExample } from "./types";

export type { FormExample, RiskExample } from "./types";

/** The worked examples the form can be opened with, by `?example=` value. */
export const EXAMPLES: Record<string, FormExample> = { mcas: MCAS };

export function findExample(name: string | undefined): FormExample | null {
  if (!name) return null;
  return EXAMPLES[name.toLowerCase()] ?? null;
}
