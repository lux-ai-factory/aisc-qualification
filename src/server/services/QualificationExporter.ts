import { parseTargetSystemTag, findSector } from "@/data";
import type { QualificationWithAnswers } from "@/server/repositories/QualificationRepository";

/**
 * The shape the ontology service consumes. This app owns the database and the
 * taxonomies, so it resolves the tags to their display names here; the service
 * never parses the Prisma schema or the taxonomy files.
 *
 * Mirrors scripts/export_qualification.mjs, which does the same for the CLI.
 */
export type QualificationExport = {
  id: string;
  systemName: string;
  systemVersion: string;
  company: string;
  description: string;
  targetUseCase: string;
  targetUsers: string;
  intendedDeployers: string | null;
  targetSystems: Array<{ tag: string; category: string; subcategory: string }>;
  sectors: Array<{ id: string; name: string }>;
  marketFormTags: string[];
  localityTags: string[];
  answers: Array<{ toolId: string; questionId: string; answer: string }>;
  risks: Array<{
    position: number;
    risk: string;
    source: string;
    vulnerability: string | null;
    consequence: string;
    affected: string;
    impactAreas: string[];
    control: string;
    followUpControl: string | null;
  }>;
};

export function toExport(q: QualificationWithAnswers): QualificationExport {
  return {
    id: q.id,
    systemName: q.systemName,
    systemVersion: q.systemVersion,
    company: q.company,
    description: q.description,
    targetUseCase: q.targetUseCase,
    targetUsers: q.targetUsers,
    intendedDeployers: q.intendedDeployers,
    // A tag that no longer resolves is dropped, not passed through: a Domain or
    // AICapability node with an unknown id would be a claim we cannot support.
    targetSystems: q.targetSystemTags.flatMap((tag) => {
      const resolved = parseTargetSystemTag(tag);
      return resolved
        ? [
            {
              tag,
              category: resolved.category.name,
              subcategory: resolved.sub.name,
            },
          ]
        : [];
    }),
    sectors: q.sectorTags.flatMap((id) => {
      const sector = findSector(id);
      return sector ? [{ id: sector.id, name: sector.name }] : [];
    }),
    marketFormTags: q.marketFormTags,
    localityTags: q.localityTags,
    answers: q.answers
      .map((a) => ({
        toolId: a.toolId,
        questionId: a.questionId,
        answer: a.answer,
      }))
      .sort((a, b) => a.questionId.localeCompare(b.questionId)),
    risks: q.risks.map((r) => ({
      position: r.position,
      risk: r.risk,
      source: r.source,
      vulnerability: r.vulnerability,
      consequence: r.consequence,
      affected: r.affected,
      impactAreas: r.impactAreas,
      control: r.control,
      followUpControl: r.followUpControl,
    })),
  };
}
