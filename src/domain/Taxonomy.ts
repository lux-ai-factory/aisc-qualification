import {
  type Sector,
  type TargetSystemCategory,
  type TargetSystemSubcategory,
  sectors as sectorsData,
  targetSystems as targetSystemsData,
} from "@/data";

export type ResolvedTargetSystem = {
  category: TargetSystemCategory;
  sub: TargetSystemSubcategory;
};

export class TaxonomyService {
  constructor(
    private readonly targetSystems: TargetSystemCategory[] = targetSystemsData,
    private readonly sectors: Sector[] = sectorsData,
  ) {}

  parseTargetSystemTag(tag: string): ResolvedTargetSystem | null {
    const [categoryId, subId] = tag.split(":");
    if (!categoryId || !subId) return null;
    const category = this.targetSystems.find((c) => c.id === categoryId);
    if (!category) return null;
    const sub = category.items.find((s) => s.id === subId);
    if (!sub) return null;
    return { category, sub };
  }

  isValidTargetSystemTag(tag: string): boolean {
    return this.parseTargetSystemTag(tag) !== null;
  }

  findSector(id: string | null | undefined): Sector | null {
    if (!id) return null;
    return this.sectors.find((s) => s.id === id) ?? null;
  }

  isValidSectorTag(id: string): boolean {
    return this.findSector(id) !== null;
  }
}

export const taxonomyService = new TaxonomyService();
