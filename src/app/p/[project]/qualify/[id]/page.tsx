import Link from "next/link";
import { notFound } from "next/navigation";
import { qualificationService } from "@/server/services/QualificationService";
import { versionLabel } from "@/domain/SystemCard";
import { ontologyService } from "@/server/services/OntologyService";
import { OntologyClient } from "@/server/services/OntologyClient";
import AnsweredForm from "./AnsweredForm";
import FillStatus from "./FillStatus";
import OntologyView from "./OntologyView";
import QualificationTabs from "./QualificationTabs";
import ComponentsPanel from "./ComponentsPanel";
import { engineClient } from "@/server/services/EngineClient";
import type { EngineComponent } from "@/domain/cardComponents";
import type { OntologyExtracted } from "@/domain/OntologyView";

export default async function QualificationDetailPage({
  params,
}: {
  params: Promise<{ project: string; id: string }>;
}) {
  const { project, id } = await params;

  // Raw <a href> links are not rewritten by Next's basePath — prefix explicitly
  // (same pattern as SiteHeader) so the downloads work when served under a subpath.
  const basePath = process.env.NEXT_BASE_PATH || "";

  // Looked up within this project, never by the id from the URL alone.
  const q = await qualificationService.get(project, id);
  if (!q) notFound();

  // One system; its card in versions: this card is the latest version's, or
  // history. Only the latest changes; when the platform cannot say, nothing is
  // offered for editing either.
  const standing = await qualificationService
    .standing(project, { projectId: q.projectId, systemId: q.systemId })
    .catch(() => null);
  const readOnly = !standing?.current;

  const { engineComponents, engineError } = readOnly
    ? { engineComponents: [], engineError: null }
    : await loadEngineComponents(q.projectId);
  const suggestions = componentSuggestions(q.ontologyExtracted as OntologyExtracted | null);

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

      {/* The filler starts when the qualification is saved, so arriving here
          usually means arriving before its draft exists. */}
      {!readOnly && <FillStatus qualificationId={q.id} />}

      {!readOnly && (
        <ComponentsPanel
          projectId={project}
          qualificationId={q.id}
          engine={engineComponents}
          engineError={engineError}
          linked={q.components}
          suggestions={suggestions}
        />
      )}

      <QualificationTabs
        form={
          <AnsweredForm
            metadata={{
              systemName: q.systemName,
              systemVersion: q.systemVersion,
              company: q.company,
              description: q.description,
              targetUseCase: q.targetUseCase,
              targetUsers: q.targetUsers,
              intendedDeployers: q.intendedDeployers,
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
            risks={q.risks.map((r) => ({
              id: r.id,
              risk: r.risk,
              source: r.source,
              vulnerability: r.vulnerability,
              consequence: r.consequence,
              affected: r.affected,
              impactAreas: r.impactAreas,
              control: r.control,
              followUpControl: r.followUpControl,
            }))}
          />
        }
        card={
          ontology ? (
            <OntologyView
              projectId={project}
              qualificationId={q.id}
              initialView={ontology.view}
              initialProblems={ontology.problems}
              vocabularies={vocabularies}
              readOnly={readOnly}
              downloads={{
                pdf: `${basePath}/api/qualifications/${q.id}/ai-card.pdf`,
                json: `${basePath}/api/qualifications/${q.id}/ai-card.json`,
                jsonld: `${basePath}/api/qualifications/${q.id}/ontology.jsonld`,
              }}
            />
          ) : (
            <section className="qf-section">
              <p className="qf-help">
                This system&rsquo;s knowledge graph could not be built: {ontologyError} The
                answered form is unaffected.
              </p>
            </section>
          )
        }
      />
    </main>
  );
}

/** The engine's components, for linking to the latest card. An engine that is
 *  down leaves the card as it is and says so in the panel. */
async function loadEngineComponents(
  projectId: string,
): Promise<{ engineComponents: EngineComponent[]; engineError: string | null }> {
  try {
    return { engineComponents: await engineClient.components(projectId), engineError: null };
  } catch (err) {
    return {
      engineComponents: [],
      engineError: err instanceof Error ? err.message : "The engine did not answer",
    };
  }
}

/** The components the card agent named, as labels: suggestions, never links. */
function componentSuggestions(extracted: OntologyExtracted | null): string[] {
  const named = (extracted?.components ?? []) as Array<string | { label: string }>;
  return named.map((c) => (typeof c === "string" ? c : c.label));
}
