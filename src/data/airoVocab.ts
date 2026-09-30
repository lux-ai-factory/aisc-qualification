// Our own picker lists, only for what VAIR has no vocabulary for (2026-09-30): who a risk affects.
// Everything VAIR covers is in vairVocab.ts. The JSON is shared with services/ontology (Python
// reads the same file), so ids stay in lockstep.
import vocab from "./airo_vocab.json";
import { SUBJECTS } from "./vairVocab";

export type VocabEntry = { id: string; label: string };

type Raw = { id: string; label: string };

export const AFFECTED: VocabEntry[] = (vocab.affected as Raw[]).map(strip);

function strip(e: Raw): VocabEntry {
  return { id: e.id, label: e.label };
}

export const isAffected = (id: string) => AFFECTED.some((e) => e.id === id) || SUBJECTS.some((t) => t.id === id);

export function vocabLabel(list: VocabEntry[], id: string): string {
  return list.find((e) => e.id === id)?.label ?? id;
}
