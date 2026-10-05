/**
 * The parts of the AI system, as its card lists them.
 *
 * A part's key is its identity: kept when the next card version carries the row, so the
 * assessments made against it, and their results, stay with it through renames. The server
 * decides keys: a row carried from the card before keeps the key that card gave it, a new row
 * gets a fresh one, and a key the card before does not have is refused rather than trusted.
 */
import { FormValidationError } from "@/server/forms/QualificationFormParser";
import type { ComponentKindId } from "@/data/componentFields";

export type ComponentInput = {
  position: number;
  /** null for a row the author added; the key of the row it was carried from otherwise. */
  key: string | null;
  name: string;
  role: string | null;
  kind: ComponentKindId;
  /** The VAIR AIComponent term; null for one of our own types. */
  vairType: string | null;
  provider: "in_house" | "third_party";
  providerName: string | null;
};

export type KeyedComponent = ComponentInput & { key: string };

export function assignComponentKeys(
  rows: readonly ComponentInput[],
  allowed: ReadonlySet<string>,
  newKey: () => string,
): KeyedComponent[] {
  const used = new Set<string>();
  return rows.map((row, i) => {
    if (row.key !== null && !allowed.has(row.key)) {
      throw new FormValidationError(
        `Component ${i + 1}: it does not come from the card before. Reload the page and try again.`,
      );
    }
    if (row.key !== null && used.has(row.key)) {
      throw new FormValidationError(
        `Component ${i + 1}: the same component is listed twice.`,
      );
    }
    const key = row.key ?? newKey();
    used.add(key);
    return { ...row, key };
  });
}
