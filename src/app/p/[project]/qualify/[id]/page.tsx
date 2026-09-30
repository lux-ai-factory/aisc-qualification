import Link from "next/link";
import { notFound } from "next/navigation";
import { qualificationService } from "@/server/services/QualificationService";
import { versionLabel } from "@/domain/SystemCard";
import { ontologyService } from "@/server/services/OntologyService";
import { OntologyClient } from "@/server/services/OntologyClient";
import AnsweredForm from "./AnsweredForm";
import FillStatus from "./FillStatus";
import { placesToCheck } from "@/domain/placesToCheck";
import OntologyView from "./OntologyView";
import QualificationTabs from "./QualificationTabs";
import { questionnairesFor } from "@/server/services/QuestionnaireService";
import { newerVersion } from "@/domain/forms/moveCard";
import { annexDefaultVersion } from "@/domain/forms/legacy";
import FormLine from "../../FormLine";

export default async function QualificationDetailPage({
  params,
}: {
  params: Promise<{ project: string; id: string }>;
}) {
  const { project, id } = await params;

  // Raw <a href> links are not rewritten by Next's basePath — prefix explicitly
  // (same pattern as SiteHeader) so the downloads work when served under a subpath.
  const basePath = process.env.NEXT_BASE_PATH || "";

  // Looked up in this project's own database: a card of another project is not
  // there. The middleware has already asked the platform about this project.
  const q = await qualificationService.get(project, id);
  if (!q) notFound();

  // One system; its card in versions: this card is the latest version's, or
  // history. Only the latest changes; when the platform cannot say, nothing is
  // offered for editing either.
  const standing = await qualificationService
    .standing(project, { systemId: q.systemId })
    .catch(() => null);
  const readOnly = !standing?.current;


  // The ontology IS the card: built on read from the form, the agent's
  // extraction and the reviewer's patch. A sidecar that is down must not take
  // the page down with it, so the failure is reported inside the card tab and
  // the answered form is unaffected.
  let ontology: Awaited<ReturnType<typeof ontologyService.build>> | null = null;
  let ontologyError: string | null = null;
  let vocabularies: Record<string, string[]> = {};
  try {
    ontology = await ontologyService.build(project, q.id);
    vocabularies = await OntologyClient.fromEnv().vocabularies();
  } catch (err) {
    ontologyError =
      err instanceof Error ? err.message : "The knowledge graph could not be built.";
  }

  // The questionnaire version the card was filled with; a card from before
  // questionnaires is the default version, and so is one whose version cannot
  // be found. Only the current card is offered a newer version to move to (T42).
  const questionnaires = await questionnairesFor(project);
  const form = (await questionnaires.resolve(q.questionnaireVersionId ?? null)) ?? annexDefaultVersion();
  const newer = standing?.current
    ? newerVersion(form, await questionnaires.latestVersion(form.questionnaireId).catch(() => null))
    : null;

  const savedAt = q.createdAt.toISOString().slice(0, 16).replace("T", " ");

  return (
    <main className="qualify-page qualify-page--wide">
      <header className="qualify-header">
        <div className="qf-header-row">
          <div>
            {standing && standing.versionNumber > 0 && (
              <p className="qf-row-sysver">Version {standing.versionNumber}</p>
            )}
            <h1>{q.systemName}</h1>
            <p>
              {q.company} · {versionLabel(q.systemVersion)} · saved {savedAt}{" "}
              UTC
            </p>
            <FormLine project={project} questionnaireId={form.questionnaireId} questionnaireName={form.questionnaireName} versionNumber={form.versionNumber} basePath={basePath} newer={newer} />
          </div>
          <div className="qf-header-actions">
            {standing?.current && (
              <Link className="btn qf-header-btn" href={`/p/${project}/system/edit`}>
                Edit the AI system
              </Link>
            )}
            <Link className="btn ghost qf-header-btn" href={`/p/${project}/qualifications`}>
              Versions
            </Link>
          </div>
        </div>
      </header>

      {readOnly && (
        <p className="qf-prefilled">
          v{standing?.versionNumber || "?"}, kept as it was: only the latest version changes.{" "}
          {standing?.currentCardId && (
            <Link href={`/p/${project}/qualify/${standing.currentCardId}`}>
              Open the latest card
            </Link>
          )}
        </p>
      )}

      <QualificationTabs
        form={
          <AnsweredForm
            form={form}
            metadata={{
              systemName: q.systemName,
              systemVersion: q.systemVersion,
              company: q.company,
              description: q.description,
              targetUseCase: q.targetUseCase,
              targetUsers: q.targetUsers,
              intendedDeployers: q.intendedDeployers,
              providerTerm: q.providerTerm,
              deployerTerm: q.deployerTerm,
              systemType: q.systemType,
              purpose: q.purpose,
              targetSystemTags: q.targetSystemTags,
              sectorTags: q.sectorTags,
              marketFormTags: q.marketFormTags,
              localityTags: q.localityTags,
            }}
            answers={q.answers.map((a) => ({
              id: a.id,
              toolId: a.toolId,
              questionId: a.questionId,
              answer: a.answer,
            }))}
            systemComponents={(q.systemComponents ?? []).map((c) => ({
              id: c.id,
              name: c.name,
              role: c.role,
              kind: c.kind,
              vairType: c.vairType,
              provider: c.provider,
              providerName: c.providerName,
            }))}
            risks={q.risks.map((r) => ({
              id: r.id,
              risk: r.risk,
              source: r.source,
              sourceTerm: r.sourceTerm,
              vulnerability: r.vulnerability,
              consequence: r.consequence,
              consequenceTerm: r.consequenceTerm,
              impactTerm: r.impactTerm,
              affected: r.affected,
              impactAreas: r.impactAreas,
              control: r.control,
              controlTerm: r.controlTerm,
              followUpControl: r.followUpControl,
              followUpControlTerm: r.followUpControlTerm,
            }))}
          />
        }
        card={
          <>
            {/* Refine with AI, in the AI card tab only: the card is built from the
                form alone, and the filler runs on top of it when a person asks. */}
            {!readOnly && (
              <FillStatus
                project={project}
                qualificationId={q.id}
                statusUrl={`${basePath}/p/${project}/api/qualifications/${q.id}/fill`}
                places={ontology ? placesToCheck(ontology.view) : 0}
              />
            )}
            {ontology ? (
              <OntologyView
                projectId={project}
                qualificationId={q.id}
                initialView={ontology.view}
                initialProblems={ontology.problems}
                vocabularies={vocabularies}
                readOnly={readOnly}
                downloads={{
                  pdf: `${basePath}/p/${project}/api/qualifications/${q.id}/ai-card.pdf`,
                  json: `${basePath}/p/${project}/api/qualifications/${q.id}/ai-card.json`,
                  jsonld: `${basePath}/p/${project}/api/qualifications/${q.id}/ontology.jsonld`,
                }}
              />
            ) : (
              <section className="qf-section">
                <p className="qf-help">
                  This system&rsquo;s knowledge graph could not be built: {ontologyError} The
                  answered form is unaffected.
                </p>
              </section>
            )}
          </>
        }
      />
    </main>
  );
}
