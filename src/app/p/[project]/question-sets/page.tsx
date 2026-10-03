import Link from "next/link";
import { projectDbPastDoor } from "@/lib/projectDb";
import { questionSetsOn } from "@/server/services/QuestionSetService";
import RetireButton from "../RetireButton";
import { retireQuestionSet } from "./actions";

/** How the "Made by" column reads a set's stored origin. */
const MADE_BY: Record<string, string> = { builtin: "Built in", builder: "Question set editor", import: "Imported" };

/** YYYY-MM-DD of an ISO 8601 time, in UTC. */
const day = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");

// The project's question sets: where questions are written, kept in the
// project's own database next to its cards. The builtin Annex IV set is in every project.
export default async function QuestionSetsPage({
  params,
  searchParams,
}: {
  params: Promise<{ project: string }>;
  searchParams: Promise<{ retired?: string }>;
}) {
  const { project } = await params;
  const retired = (await searchParams).retired === "1";
  const rows = await questionSetsOn(await projectDbPastDoor(project)).list({ retired });
  // Plain <a download> links do not get Next's basePath: add it here, as the card page does.
  const basePath = process.env.NEXT_BASE_PATH || "";
  const setPath = (setId: string) => `/p/${project}/question-sets/${encodeURIComponent(setId)}`;
  const exportHref = (setId: string, format: "csv" | "md", version: number) =>
    `${basePath}${setPath(setId)}/export?format=${format}&version=${version}`;

  return (
    <main className="qualify-page qualify-page--form qf-forms-page">
      <header className="qualify-header">
        <div className="qf-header-row">
          <div>
            <h1>Question sets</h1>
            <p>
              Questions are written here. Questionnaires pick them. These question sets belong to this
              project; to use one in another project, export it and import it there. Editing one makes a
              new version, and questionnaires keep the version they picked.
            </p>
          </div>
          <div className="qf-header-actions">
            <Link className="btn ghost qf-header-btn" href={`/p/${project}/question-sets/import`}>
              Import question set
            </Link>
            <Link className="btn qf-header-btn" href={`/p/${project}/question-sets/new`}>
              + New question set
            </Link>
          </div>
        </div>
      </header>
      <div className="qf-forms-scroll">
        <table className="qf-forms-table">
          <thead>
            <tr>
              <th>Question set</th>
              <th>Version</th>
              <th>Questions</th>
              <th>Made by</th>
              <th>{retired ? "Retired" : "Saved by"}</th>
              <th>
                <span className="qf-sr">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.setId}>
                <td className="qf-forms-name">
                  <strong>{r.name}</strong>
                  {r.builtin && <span className="qf-tag">built in</span>}
                  {r.description && <p className="qf-forms-desc">{r.description}</p>}
                </td>
                <td className="qf-forms-num">v{r.version}</td>
                <td className="qf-forms-num">{r.questionCount}</td>
                <td>{MADE_BY[r.origin] ?? r.origin}</td>
                <td>{retired ? day(r.retiredAt) : `${r.savedBy}, ${day(r.savedAt)}`}</td>
                <td>
                  <div className="qf-forms-actions">
                    <Link className="btn ghost" href={setPath(r.setId)}>
                      Open
                    </Link>
                    {!retired && !r.builtin && (
                      <Link className="btn ghost" href={`${setPath(r.setId)}/edit`}>
                        Edit
                      </Link>
                    )}
                    <a className="qf-forms-export" href={exportHref(r.setId, "csv", r.version)} download>
                      Export CSV
                    </a>
                    <a className="qf-forms-export" href={exportHref(r.setId, "md", r.version)} download>
                      Export Markdown
                    </a>
                    {!retired && !r.builtin && (
                      <RetireButton name={r.name} action={retireQuestionSet.bind(null, project, r.setId)} />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="qf-forms-toggle">
        {retired ? (
          <Link href={`/p/${project}/question-sets`}>Show current question sets</Link>
        ) : (
          <Link href={`/p/${project}/question-sets?retired=1`}>Show retired question sets</Link>
        )}
      </p>
    </main>
  );
}
