// Typed access to the classification taxonomies (target systems and sectors).
// The qualification questions themselves live in `keyQuestions.ts`.

import targetSystemsData from "./target_systems.json";
import sectorsData from "./sectors.json";

export type TargetSystemSubcategory = { id: string; name: string };
export type TargetSystemCategory = {
  id: string;
  name: string;
  items: TargetSystemSubcategory[];
};
export type Sector = { id: string; name: string };

export const targetSystems = targetSystemsData as TargetSystemCategory[];
export const sectors = sectorsData as Sector[];

/**
 * Tag IDs for target systems are composite "<category>:<sub>" strings; for
 * sectors they are flat ids. Helpers below resolve them to display-friendly
 * names and validate against the imported taxonomies.
 */

export function parseTargetSystemTag(
  tag: string,
): { category: TargetSystemCategory; sub: TargetSystemSubcategory } | null {
  const [categoryId, subId] = tag.split(":");
  if (!categoryId || !subId) return null;
  const category = targetSystems.find((c) => c.id === categoryId);
  if (!category) return null;
  const sub = category.items.find((s) => s.id === subId);
  if (!sub) return null;
  return { category, sub };
}

export function isValidTargetSystemTag(tag: string): boolean {
  return parseTargetSystemTag(tag) !== null;
}

export function isValidSectorTag(id: string): boolean {
  return sectors.some((s) => s.id === id);
}

export function findSector(id: string | null | undefined): Sector | null {
  if (!id) return null;
  return sectors.find((s) => s.id === id) ?? null;
}
