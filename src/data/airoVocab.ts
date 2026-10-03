// Our own picker lists, only for what VAIR has no vocabulary for: who a risk affects.
// Everything VAIR covers is in vairVocab.ts. services/ontology reads the same JSON file, so the
// ids are the same on both sides.
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
