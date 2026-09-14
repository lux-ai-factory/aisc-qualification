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

export default async function QualificationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Raw <a href> links are not rewritten by Next's basePath — prefix explicitly
  // (same pattern as SiteHeader) so the downloads work when served under a subpath.
  const basePath = process.env.NEXT_BASE_PATH || "";

  const q = await qualificationService.get(id);
  if (!q) notFound();

  // The ontology IS the card: built on read from the form, the agent's
  // extraction and the reviewer's patch. A sidecar that is down must not take
  // the page down with it, so the failure is reported inside the card tab and
  // the answered form is unaffected.
  let ontology: Awaited<ReturnType<typeof ontologyService.build>> | null = null;
  let ontologyError: string | null = null;
  let vocabularies: Record<string, string[]> = {};
  try {
    ontology = await ontologyService.build(q.id);
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
            <h1>{q.systemName}</h1>
            <p>
              {q.company} · {versionLabel(q.systemVersion)} · saved {savedAt}{" "}
              UTC
            </p>
          </div>
          <Link className="btn ghost qf-header-btn" href="/qualifications">
            Compiled qualifications
          </Link>
        </div>
      </header>

      {/* The filler starts when the qualification is saved, so arriving here
          usually means arriving before its draft exists. */}
      <FillStatus qualificationId={q.id} />

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
              qualificationId={q.id}
              initialView={ontology.view}
              initialProblems={ontology.problems}
              vocabularies={vocabularies}
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
