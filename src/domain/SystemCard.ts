import type { Qualification } from "@prisma/client";
import type { ResolvedTargetSystem } from "./Taxonomy";
import type { Sector } from "@/data";

export type ArticleFinding = {
  article: string;
  title: string;
  summary: string;
  points: string[];
  references: string[];
};

export type RawSystemCard = {
  overview: string;
  findings: ArticleFinding[];
  open_issues: string[];
};

export type SystemCard = RawSystemCard & {
  system_name: string;
  system_version: string;
  provider: string;
  description: string;
  target_use_case: string;
  target_users: string;
  classification: {
    target_systems: { category: string; subcategory: string }[];
    sectors: string[];
  };
  generated_at: string;
  qualification_id: string;
};

export function assembleSystemCard(
  q: Qualification,
  raw: RawSystemCard,
  targetSystems: ResolvedTargetSystem[],
  sectors: Sector[],
  now: Date = new Date(),
): SystemCard {
  return {
    system_name: q.systemName,
    system_version: q.systemVersion,
    provider: q.company,
    description: q.description,
    target_use_case: q.targetUseCase,
    target_users: q.targetUsers,
    classification: {
      target_systems: targetSystems.map((t) => ({
        category: t.category.name,
        subcategory: t.sub.name,
      })),
      sectors: sectors.map((s) => s.name),
    },
    overview: raw.overview,
    findings: raw.findings,
    open_issues: raw.open_issues ?? [],
    generated_at: now.toISOString().slice(0, 16).replace("T", " ") + " UTC",
    qualification_id: q.id,
  };
}

export function fileSlug(systemName: string): string {
  return systemName.replace(/[^a-zA-Z0-9-]+/g, "_").toLowerCase();
}
