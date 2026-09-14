// Controlled vocabularies for the AIRO-aligned pickers. The JSON is shared with
// services/ontology (Python reads the same file), so ids stay in lockstep.
import vocab from "./airo_vocab.json";

export type VocabEntry = { id: string; label: string };

type Raw = { id: string; label: string };

export const MARKET_FORMS: VocabEntry[] = (vocab.marketForm as Raw[]).map(strip);
export const LOCALITIES: VocabEntry[] = (vocab.locality as Raw[]).map(strip);
export const IMPACT_AREAS: VocabEntry[] = (vocab.impactArea as Raw[]).map(strip);
export const AFFECTED: VocabEntry[] = (vocab.affected as Raw[]).map(strip);

function strip(e: Raw): VocabEntry {
  return { id: e.id, label: e.label };
}

const has = (list: VocabEntry[]) => (id: string) =>
  list.some((e) => e.id === id);

export const isMarketForm = has(MARKET_FORMS);
export const isLocality = has(LOCALITIES);
export const isImpactArea = has(IMPACT_AREAS);
export const isAffected = has(AFFECTED);

export function vocabLabel(list: VocabEntry[], id: string): string {
  return list.find((e) => e.id === id)?.label ?? id;
}
