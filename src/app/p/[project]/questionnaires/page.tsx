import Link from "next/link";
import { questionnaireService } from "@/server/services/QuestionnaireService";
import RetireButton from "../RetireButton";
import { retireQuestionnaire } from "./actions";

/** How the "Made by" column reads a questionnaire's stored origin. */
const MADE_BY: Record<string, string> = { builtin: "Built in", builder: "Questionnaire builder", import: "Imported" };

/** YYYY-MM-DD of an ISO 8601 time, in UTC. */
const day = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");

// The install's questionnaires (T34): what an AI card is filled with. The same
// for every project; the project is only where the links lead back to.
export default async function QuestionnairesPage({
  params,
  searchParams,
}: {
  params: Promise<{ project: string }>;
  searchParams: Promise<{ retired?: string }>;
}) {
  const { project } = await params;
  const retired = (await searchParams).retired === "1";
  const rows = await questionnaireService.library({ retired });
  // Plain <a download> links do not get Next's basePath: add it here, as the card page does.
  const basePath = process.env.NEXT_BASE_PATH || "";
  const path = (id: string) => `/p/${project}/questionnaires/${encodeURIComponent(id)}`;
  const exportHref = (id: string, version: number, selfContained: boolean) =>
    `${basePath}${path(id)}/export?format=json&version=${version}${selfContained ? "&bundle=self-contained" : ""}`;

  return (
    <main className="qualify-page qualify-page--form qf-forms-page">
      <header className="qualify-header">
        <div className="qf-header-row">
          <div>
            <h1>Questionnaires</h1>
            <p>
              A questionnaire is what an AI card is filled with. Every project on this install sees the same
              questionnaires. A new AI card starts with the Annex IV default. Assemble one from question sets,
              or import one from a file.
            </p>
          </div>
          <div className="qf-header-actions">
            <Link className="btn ghost qf-header-btn" href={`/p/${project}/question-sets`}>
              Question sets
            </Link>
            <Link className="btn ghost qf-header-btn" href={`/p/${project}/questionnaires/import`}>
              Import questionnaire
            </Link>
            <Link className="btn qf-header-btn" href={`/p/${project}/questionnaires/new`}>
              + New questionnaire
            </Link>
          </div>
        </div>
      </header>
      <div className="qf-forms-scroll">
        <table className="qf-forms-table">
          <thead>
            <tr>
              <th>Questionnaire</th>
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
              <tr key={r.questionnaireId}>
                <td className="qf-forms-name">
                  <strong>{r.name}</strong>
                  {r.isDefault && <span className="qf-tag qf-tag--default">default</span>}
                  {!retired && r.updates > 0 && <span className="qf-tag qf-tag--notice">update available</span>}
                  {r.description && <p className="qf-forms-desc">{r.description}</p>}
                </td>
                <td className="qf-forms-num">v{r.version}</td>
                <td className="qf-forms-num">{r.questionCount}</td>
                <td>{MADE_BY[r.origin] ?? r.origin}</td>
                <td>{retired ? day(r.retiredAt) : `${r.savedBy}, ${day(r.savedAt)}`}</td>
                <td>
                  <div className="qf-forms-actions">
                    {!retired && (
                      <Link
                        className="btn ghost"
                        href={`/p/${project}/questionnaires/new?from=${encodeURIComponent(r.questionnaireId)}`}
                      >
                        Start from
                      </Link>
                    )}
                    {!retired && !r.builtin && (
                      <Link className="btn ghost" href={`${path(r.questionnaireId)}/edit`}>
                        Edit
                      </Link>
                    )}
                    <a className="qf-forms-export" href={exportHref(r.questionnaireId, r.version, false)} download>
                      Export
                    </a>
                    <a className="qf-forms-export" href={exportHref(r.questionnaireId, r.version, true)} download>
                      Export self-contained
                    </a>
                    {!retired && !r.builtin && (
                      <RetireButton
                        name={r.name}
                        action={retireQuestionnaire.bind(null, project, r.questionnaireId)}
                      />
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
          <Link href={`/p/${project}/questionnaires`}>Show current questionnaires</Link>
        ) : (
          <Link href={`/p/${project}/questionnaires?retired=1`}>Show retired questionnaires</Link>
        )}
      </p>
    </main>
  );
}
