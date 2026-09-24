/**
 * The upload, step by step.
 *
 * Choosing a file reads it at once. A file that cannot be read says why. One
 * that can, on a form that already has answers, asks what to do with them, and
 * nothing on the form changes until one of the two buttons is pressed. On an
 * empty form the two choices are the same, so it simply lands.
 *
 * The reading and the merge are the prefill service's: this only decides what
 * comes next, and the reader is passed in so the steps can be tested alone.
 */
import type { PrefillMode, PrefillResult, PrefillRisk, PrefillValues } from "@/server/services/PrefillClient";
import { answeredFields, riskWritten } from "@/lib/prefillChoice";

export type Reader = (
  file: File,
  mode: PrefillMode,
  current: PrefillValues,
  currentRisks: PrefillRisk[],
) => Promise<PrefillResult>;

export type Apply = {
  kind: "apply";
  values: PrefillValues;
  filled: string[];
  kept: string[];
  /** the rows to put on the form, or null to leave its rows alone */
  risks: PrefillRisk[] | null;
  risksKept: boolean;
};

/** How many answers and risk rows there are, on each side, for the question. */
type Counts = { answered: number; proposed: number; risksAnswered: number; risksProposed: number };

export type Checked =
  | { kind: "error"; error: string }
  | { kind: "nothing" }
  | ({ kind: "choose" } & Counts)
  | Apply;

/** What the upload section shows. */
export type UploadStatus =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "error"; error: string }
  | { kind: "nothing" }
  | ({ kind: "choose" } & Counts)
  | { kind: "applied"; filled: string[]; kept: string[]; risks: number; risksKept: boolean };

/** Read the file just chosen and say what the next step is. It reads with the
 *  careful choice, so a check is never what overwrites somebody's typing. */
export async function checkDocument(
  file: File,
  current: PrefillValues,
  currentRisks: PrefillRisk[],
  read: Reader,
): Promise<Checked> {
  const result = await read(file, "empty", current, currentRisks);
  if (!result.ok) return { kind: "error", error: result.error };
  const proposed = result.filled.length + result.kept.length;
  const risksProposed = result.risksProposed;
  if (proposed === 0 && risksProposed === 0) return { kind: "nothing" };
  const answered = answeredFields(current).length;
  const risksAnswered = currentRisks.filter(riskWritten).length;
  if (answered > 0 || risksAnswered > 0) {
    return { kind: "choose", answered, proposed, risksAnswered, risksProposed };
  }
  return toApply(result);
}

function toApply(result: Extract<PrefillResult, { ok: true }>): Apply {
  return {
    kind: "apply",
    values: result.values,
    filled: result.filled,
    kept: result.kept,
    risks: result.risks,
    risksKept: result.risksKept,
  };
}

/** Apply the choice the person pressed. */
export async function applyDocument(
  file: File,
  mode: PrefillMode,
  current: PrefillValues,
  currentRisks: PrefillRisk[],
  read: Reader,
): Promise<Apply | { kind: "error"; error: string }> {
  const result = await read(file, mode, current, currentRisks);
  if (!result.ok) return { kind: "error", error: result.error };
  return toApply(result);
}
