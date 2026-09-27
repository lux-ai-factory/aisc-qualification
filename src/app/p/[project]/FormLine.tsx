import Link from "next/link";
import type { ResolvedQuestionnaireVersion } from "@/domain/forms/types";

// The "Questionnaire:" line of the card and edit pages (T42): which
// questionnaire version the card is filled with, and links that export that
// very version as a file. Plain <a download> links (Next's Link would navigate
// instead), so they do not get Next's basePath: the page passes it in. With
// `newer`, the questionnaire has a later version the card could move to.

type Props = {
  project: string;
  questionnaireId: string;
  questionnaireName: string;
  versionNumber: number;
  basePath?: string;
  newer?: { versionId: string; versionNumber: number } | null;
  /** Accepted and unused: some callers pass the resolved version too. */
  form?: ResolvedQuestionnaireVersion;
};

export default function FormLine({
  project,
  questionnaireId,
  questionnaireName,
  versionNumber,
  basePath = "",
  newer,
}: Props) {
  const href = (format: "json" | "csv" | "md") =>
    `${basePath}/p/${project}/questionnaires/${encodeURIComponent(questionnaireId)}/export?format=${format}&version=${versionNumber}`;
  const label = `Export ${questionnaireName} v${versionNumber} as`;
  return (
    <>
      <p className="qf-row-form">
        <span className="qf-row-form-name">
          Questionnaire: {questionnaireName} v{versionNumber}
        </span>
        <span className="qf-row-form-sep"> · </span>
        <a href={href("json")} download aria-label={`${label} JSON`}>
          JSON
        </a>
        <span className="qf-row-form-sep"> · </span>
        <a href={href("csv")} download aria-label={`${label} CSV`}>
          CSV
        </a>
        <span className="qf-row-form-sep"> · </span>
        <a href={href("md")} download aria-label={`${label} Markdown`}>
          Markdown
        </a>
      </p>
      {newer && (
        <p className="qf-questionnaire-update">
          {`${questionnaireName} has a newer version, v${newer.versionNumber}. `}
          <Link href={`/p/${project}/system/edit?questionnaireVersion=${encodeURIComponent(newer.versionId)}`}>
            {`Move to v${newer.versionNumber}`}
          </Link>
        </p>
      )}
    </>
  );
}
