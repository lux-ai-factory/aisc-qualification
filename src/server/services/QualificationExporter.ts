import { parseTargetSystemTag, findSector } from "@/data";
import type { QualificationWithAnswers } from "@/server/repositories/QualificationRepository";
import type { AnnexPointId } from "@/domain/forms/annexPoints";
import type { ResolvedQuestionnaireVersion } from "@/domain/forms/types";

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
  /** With a form version, an answer to one of its questions also carries the
   *  question's citation and Annex IV point; a stored answer the version does
   *  not ask keeps the plain shape. */
  answers: Array<{
    toolId: string;
    questionId: string;
    answer: string;
    citation?: string;
    annexPoint?: AnnexPointId | null;
  }>;
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
  /** The engine components the card links, each by its AIRO property; absent
   *  when it links none, so a card without links exports as it always did. */
  engineComponents?: Array<{
    pid: string;
    name: string;
    componentType: string;
    objectName: string;
    property: string;
    /** Which of the card's components this item is; absent when the link names none. */
    componentKey?: string;
  }>;
  /** The Components block's rows, in order; absent on a card without rows, so it exports as it
   *  always did (targets plan v2). */
  systemComponents?: Array<{
    key: string;
    name: string;
    role: string | null;
    kind: string;
    provider: string;
    providerName: string | null;
  }>;
  /** The questionnaire version the card was filled with; absent without one. */
  form?: {
    name: string;
    version: number;
    questions: Array<{
      key: string;
      text: string;
      citation: string;
      required: boolean;
      annexPoint: AnnexPointId | null;
      /** The question set the wording is from. */
      ownerSet: string;
      /** The set's id: two sets may share a name (a retired one and its successor). */
      ownerSetId: string;
      ownerBuiltin: boolean;
    }>;
  };
};

type ExportAnswer = QualificationExport["answers"][number];

/**
 * The answers, in the version's question order, each tagged from the version's
 * snapshot. Answers the version does not ask come last, by key, in the plain
 * shape, so the graph of an older card built from them does not change.
 */
function answersInForm(
  q: QualificationWithAnswers,
  form: ResolvedQuestionnaireVersion,
): ExportAnswer[] {
  const byKey = new Map(
    q.answers.map((a) => [`${a.toolId}:${a.questionId}`, a]),
  );
  const asked = new Set(form.questions.map((fq) => fq.key));
  const inForm = form.questions.flatMap((fq) => {
    const a = byKey.get(fq.key);
    return a
      ? [
          {
            toolId: a.toolId,
            questionId: a.questionId,
            answer: a.answer,
            citation: fq.citation,
            annexPoint: fq.annexPoint,
          },
        ]
      : [];
  });
  const stray = q.answers
    .filter((a) => !asked.has(`${a.toolId}:${a.questionId}`))
    .map((a) => ({
      toolId: a.toolId,
      questionId: a.questionId,
      answer: a.answer,
    }))
    .sort((a, b) => {
      const ka = `${a.toolId}:${a.questionId}`;
      const kb = `${b.toolId}:${b.questionId}`;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  return [...inForm, ...stray];
}

/** The card as the ontology service reads it. Without a form version it is the
 *  export as it always was. */
export function toExport(
  q: QualificationWithAnswers,
  form?: ResolvedQuestionnaireVersion,
): QualificationExport {
  const links = q.components ?? [];
  const parts = [...(q.systemComponents ?? [])].sort((a, b) => a.position - b.position);
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
    answers: form
      ? answersInForm(q, form)
      : q.answers
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
    ...(links.length
      ? {
          engineComponents: links.map((c) => ({
            pid: c.componentPid,
            name: c.name,
            componentType: c.componentType,
            objectName: c.objectName,
            property: c.airoProperty,
            ...(c.componentKey ? { componentKey: c.componentKey } : {}),
          })),
        }
      : {}),
    ...(parts.length
      ? {
          systemComponents: parts.map((c) => ({
            key: c.key,
            name: c.name,
            role: c.role,
            kind: c.kind,
            provider: c.provider,
            providerName: c.providerName,
          })),
        }
      : {}),
    ...(form
      ? {
          form: {
            name: form.questionnaireName,
            version: form.versionNumber,
            questions: form.questions.map((fq) => ({
              key: fq.key,
              text: fq.text,
              citation: fq.citation,
              required: fq.required,
              annexPoint: fq.annexPoint,
              ownerSet: fq.setName,
              ownerSetId: fq.setId,
              ownerBuiltin: fq.setBuiltin,
            })),
          },
        }
      : {}),
  };
}
