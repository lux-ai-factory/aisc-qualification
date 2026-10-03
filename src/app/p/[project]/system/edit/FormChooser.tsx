"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ChooserPick } from "@/domain/forms/chooser";

// "Which questionnaire?": shown on the edit page until a questionnaire is
// named. Which option starts checked is decided by preselect()
// (src/domain/forms/chooser.ts); this only renders the choice and goes to the
// questionnaire picked.

export type ChooserQuestionnaireOption = {
  questionnaireId: string;
  name: string;
  versionNumber: number;
  questionCount: number;
  isDefault: boolean;
  /** Its latest version. */
  versionId: string;
  /** Every version, oldest first. */
  versionIds: string[];
};

/** The latest card and the questionnaire version it was filled with, resolved. */
export type ChooserPrevious = { cardVersionNumber: number; versionId: string; name: string; versionNumber: number };

type Props = {
  project: string;
  options: ChooserQuestionnaireOption[];
  preselected: ChooserPick | null;
  previous?: ChooserPrevious | null;
  error?: string | null;
};

const valueOf = (pick: ChooserPick) => `${pick.param}:${pick.id}`;

export default function FormChooser({ project, options, preselected, previous, error }: Props) {
  const router = useRouter();
  const [chosen, setChosen] = useState(preselected ? valueOf(preselected) : "");

  const go = () => {
    const at = chosen.indexOf(":");
    if (at < 0) return;
    const param = chosen.slice(0, at);
    const id = chosen.slice(at + 1);
    router.push(`/p/${project}/system/edit?${param}=${encodeURIComponent(id)}`);
  };

  const radio = (value: string) => (
    <input
      type="radio"
      name="questionnaire"
      value={value}
      checked={chosen === value}
      onChange={() => setChosen(value)}
    />
  );

  // P is some option's latest: that option says so. Otherwise P is offered again first.
  const sameAsLatest = previous ? options.find((o) => o.versionId === previous.versionId) : undefined;

  return (
    <section className="qualify-form qf-chooser">
      {error && <div className="error">{error}</div>}
      <fieldset className="qf-section">
        <legend>Which questionnaire?</legend>
        {previous && !sameAsLatest && (
          <label className="qf-chooser-option">
            {radio(`questionnaireVersion:${previous.versionId}`)}
            <span className="qf-chooser-name">
              {`Same questionnaire as v${previous.cardVersionNumber} (${previous.name} v${previous.versionNumber})`}
            </span>
          </label>
        )}
        {options.map((o) => {
          const same = previous !== null && previous !== undefined && o.versionId === previous.versionId;
          const newer =
            previous !== null && previous !== undefined && !same && o.versionIds.includes(previous.versionId);
          return (
            <label className="qf-chooser-option" key={o.questionnaireId}>
              {radio(`questionnaire:${o.questionnaireId}`)}
              <span className="qf-chooser-name">{o.name}</span>{" "}
              <span className="qf-chooser-meta">v{o.versionNumber}</span>{" "}
              <span className="qf-chooser-meta">{o.questionCount} questions</span>
              {(o.isDefault || same || newer) && (
                <span className="qf-chooser-tags">
                  {o.isDefault && <span className="qf-tag qf-tag--default"> default</span>}
                  {same && <span className="qf-tag"> same as v{previous!.cardVersionNumber}</span>}
                  {newer && <span className="qf-tag qf-tag--notice"> update available</span>}
                </span>
              )}
            </label>
          );
        })}
      </fieldset>
      <div className="qf-actions">
        <Link className="btn ghost" href={`/p/${project}/questionnaires/new`}>
          + New questionnaire
        </Link>
        <Link className="btn ghost" href={`/p/${project}/questionnaires/import`}>
          Import questionnaire
        </Link>
        <button className="btn" type="button" onClick={go} disabled={chosen === ""}>
          Continue
        </button>
      </div>
    </section>
  );
}
