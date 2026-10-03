// The worked MCAS example (src/data/examples/mcas.ts) as a stored card, a
// QualificationWithAnswers: the fixture test/fixtures/mcas-export-before.json is
// toExport(mcasCard(), annexDefaultVersion()) as the one-level forms code wrote it, and
// test/unit/annexIdentity.test.ts checks today's export of the same card against it.
// Fixed ids and dates, so the export is the same bytes every run.
import { MCAS } from "@/data/examples/mcas";
import type { QualificationWithAnswers } from "@/server/repositories/QualificationRepository";

const AT = new Date("2026-09-25T09:00:00.000Z");

export function mcasCard(): QualificationWithAnswers {
  const m = MCAS.metadata;
  const answers = Object.entries(MCAS.answers)
    .filter(([field]) => field.startsWith("q:"))
    .map(([field, answer], i) => {
      const [, toolId, questionId] = field.split(":");
      return { id: `mcas-a${i + 1}`, qualificationId: "mcas-card", toolId, questionId, answer };
    });
  const risks = MCAS.risks.map((r, position) => ({
    id: `mcas-r${position + 1}`,
    qualificationId: "mcas-card",
    position,
    risk: r.risk,
    source: r.source,
    vulnerability: r.vulnerability === "" ? null : r.vulnerability,
    consequence: r.consequence,
    affected: r.affected,
    impactAreas: [...r.areas],
    control: r.control,
    followUpControl: r.followUpControl === "" ? null : r.followUpControl,
    // the VAIR terms
    sourceTerm: r.sourceTerm || null,
    consequenceTerm: r.consequenceTerm || null,
    impactTerm: r.impactTerm || null,
    controlTerm: r.controlTerm || null,
    followUpControlTerm: r.followUpControlTerm || null,
  }));
  return {
    id: "mcas-card",
    projectId: "00000000-0000-4000-8000-000000000001",
    systemId: "00000000-0000-4000-8000-000000000002",
    systemName: m.systemName,
    systemVersion: m.systemVersion,
    company: m.company,
    description: m.description,
    targetUseCase: m.targetUseCase,
    targetUsers: m.targetUsers,
    systemType: m.systemType || null,
    purpose: m.purpose || null,
    targetSystemTags: [...m.targetSystemTags],
    sectorTags: [...m.sectorTags],
    marketFormTags: [...m.marketFormTags],
    localityTags: [...m.localityTags],
    intendedDeployers: m.intendedDeployers,
    systemCard: null,
    systemCardJson: null,
    ontologyExtracted: null,
    ontologyPatch: null,
    ontologyAt: null,
    systemCardAt: null,
    systemCardPdfPath: null,
    createdAt: AT,
    updatedAt: AT,
    answers,
    risks,
    components: [],
  } as unknown as QualificationWithAnswers;
}
