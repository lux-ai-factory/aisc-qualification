import {
  type EvaluationTool,
  type Question,
  type Section,
  type Sector,
  type TargetSystemCategory,
  type TargetSystemSubcategory,
  sectors as sectorsData,
  targetSystems as targetSystemsData,
  tools as toolsData,
} from "@/data";

export type ResolvedTargetSystem = {
  category: TargetSystemCategory;
  sub: TargetSystemSubcategory;
};

export type ResolvedQuestion = {
  tool: EvaluationTool;
  section: Section;
  question: Question;
};

export class TaxonomyService {
  constructor(
    private readonly tools: Record<string, EvaluationTool> = toolsData,
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

  getTool(toolId: string): EvaluationTool | null {
    return this.tools[toolId] ?? null;
  }

  resolveQuestion(toolId: string, questionId: string): ResolvedQuestion | null {
    const tool = this.getTool(toolId);
    if (!tool) return null;
    for (const part of tool.parts) {
      for (const section of part.sections) {
        const question = section.questions.find((q) => q.id === questionId);
        if (question) return { tool, section, question };
      }
    }
    return null;
  }

  validQuestionIds(): Set<string> {
    const ids = new Set<string>();
    for (const tool of Object.values(this.tools)) {
      for (const part of tool.parts) {
        for (const section of part.sections) {
          for (const q of section.questions) ids.add(`${tool.id}:${q.id}`);
        }
      }
    }
    return ids;
  }
}

export const taxonomyService = new TaxonomyService();
