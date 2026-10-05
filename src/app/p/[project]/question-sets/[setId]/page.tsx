import Link from "next/link";
import { notFound } from "next/navigation";
import { annexCitation } from "@/domain/forms/annexPoints";
import { projectDbPastDoor } from "@/lib/projectDb";
import { questionSetsOn } from "@/server/services/QuestionSetService";

/** YYYY-MM-DD of an ISO 8601 time, in UTC. */
const day = (iso: string) => new Date(iso).toISOString().slice(0, 10);

// One question set: every version with who saved it and when, one
// version's questions (the latest, or ?version=<n>), Edit and the exports.
export default async function QuestionSetPage({
  params,
  searchParams,
}: {
  params: Promise<{ project: string; setId: string }>;
  searchParams: Promise<{ version?: string; unchanged?: string }>;
}) {
  const { project, setId } = await params;
  const { version, unchanged } = await searchParams;
  const sets = questionSetsOn(await projectDbPastDoor(project));
  if (version !== undefined && !/^[1-9]\d*$/.test(version)) notFound();
  const [shown, history] = await Promise.all([
    sets.atNumber(setId, version === undefined ? undefined : Number(version)),
    sets.history(setId),
  ]);
  if (!shown) notFound();

  const setPath = `/p/${project}/question-sets/${encodeURIComponent(setId)}`;
  // Plain <a download> links do not get Next's basePath: add it here.
  const basePath = process.env.NEXT_BASE_PATH || "";
  const exportHref = (format: "csv" | "md") =>
    `${basePath}${setPath}/export?format=${format}&version=${shown.versionNumber}`;
  const editable = !shown.builtin && !shown.retired;

  return (
    <main className="qualify-page qualify-page--form qf-forms-page">
      <header className="qualify-header">
        <p className="qf-crumb">
          <Link href={`/p/${project}/question-sets`}>← Question sets</Link>
        </p>
        <div className="qf-header-row">
          <div>
            <h1>{shown.setName}</h1>
            {shown.description && <p>{shown.description}</p>}
          </div>
          <div className="qf-header-actions">
            {editable && (
              <Link className="btn qf-header-btn" href={`${setPath}/edit`}>
                Edit
              </Link>
            )}
          </div>
        </div>
      </header>
      {unchanged === "1" && (
        <p className="qf-prefilled">{`No changes: still v${shown.versionNumber}.`}</p>
      )}
      <div className="qualify-form">
        <section className="qf-section">
          <h2 className="qf-group">Versions</h2>
          <ol className="qf-set-versions">
            {history.map((v) => (
              <li key={v.versionId}>
                <Link
                  href={`${setPath}?version=${v.number}`}
                  aria-current={
                    v.number === shown.versionNumber ? "page" : undefined
                  }
                >
                  {`v${v.number} · ${v.createdBy} · ${day(v.createdAt)}`}
                </Link>
              </li>
            ))}
          </ol>
        </section>
        <section className="qf-section">
          <div className="qf-header-row">
            <h2 className="qf-group">
              v{shown.versionNumber}: {shown.questions.length}{" "}
              {shown.questions.length === 1 ? "question" : "questions"}
            </h2>
            <div className="qf-forms-actions">
              <a className="qf-forms-export" href={exportHref("csv")} download>
                Export CSV
              </a>
              <a className="qf-forms-export" href={exportHref("md")} download>
                Export Markdown
              </a>
            </div>
          </div>
          <ol className="qf-builder-rows">
            {shown.questions.map((q, i) => (
              <li key={q.questionId} className="qf-builder-row">
                <span className="qf-builder-pos">{i + 1}</span>
                <div className="qf-builder-row-body">
                  <span className="qf-question-text">{q.text}</span>
                  <div className="qf-builder-chips">
                    {q.citation !== "" && (
                      <span className="qf-citation">{q.citation}</span>
                    )}
                    {q.annexPoint && (
                      <span className="qf-overlap">
                        {annexCitation(q.annexPoint)}
                      </span>
                    )}
                    <span className="qf-tag">
                      {q.required ? "Required" : "Optional"}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
