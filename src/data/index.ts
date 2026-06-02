// Typed access to the AI Act evaluation tool taxonomies (Articles 10/12/13/14).

import index from "./index.json";
import article10 from "./article-10-data-governance.json";
import article12 from "./article-12-logging.json";
import article13 from "./article-13-transparency.json";
import article14 from "./article-14-human-oversight.json";
import dataDictionary from "./data-dictionary.json";
import targetSystemsData from "./target_systems.json";
import sectorsData from "./sectors.json";

export type Question = {
  id: string;
  text: string;
};

export type Section = {
  id: string;
  category: string;
  ai_act_references: string[];
  questions: Question[];
};

export type Part = {
  id: string;
  title: string;
  sections: Section[];
};

export type EvaluationTool = {
  id: string;
  article: string;
  title: string;
  source_file: string;
  description: string[];
  parts: Part[];
  section_count: number;
  question_count: number;
};

export type DataDictionaryGroup = {
  id: string;
  name: string;
  fields: string[];
};

export type DataDictionary = {
  id: "data-dictionary";
  article: string;
  title: string;
  source_file: string;
  parts: { title: string; groups: DataDictionaryGroup[] }[];
};

export type ToolIndexEntry = {
  id: string;
  article: string;
  title: string;
  file: string;
  part_count?: number;
  section_count?: number;
  question_count?: number;
  kind?: "template";
};

export const toolIndex = index as ToolIndexEntry[];

export const tools: Record<string, EvaluationTool> = {
  "article-10-data-governance": article10 as EvaluationTool,
  "article-12-logging": article12 as EvaluationTool,
  "article-13-transparency": article13 as EvaluationTool,
  "article-14-human-oversight": article14 as EvaluationTool,
};

export const dictionary = dataDictionary as DataDictionary;

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

export function getTool(id: string): EvaluationTool | undefined {
  return tools[id];
}

export function allQuestions(tool: EvaluationTool): Question[] {
  return tool.parts.flatMap((p) => p.sections.flatMap((s) => s.questions));
}
