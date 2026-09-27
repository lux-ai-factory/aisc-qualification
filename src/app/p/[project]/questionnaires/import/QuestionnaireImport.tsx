"use client";

import { useId, useState, type ReactNode } from "react";
import { annexCitation, isAnnexPoint } from "@/domain/forms/annexPoints";
import type { BuilderInit } from "@/domain/forms/builderState";
import type { SetGroup } from "@/domain/forms/library";
import type { QuestionnaireFile } from "@/server/services/QuestionnaireFileClient";
import QuestionnaireBuilder from "../QuestionnaireBuilder";
import { importSelfContained, readQuestionnaireFile } from "./actions";

// Importing a questionnaire file (T53, T54). A references file whose set
// versions are all here opens the builder (the page turns wide); one naming
// what this install lacks lists what is missing. A self-contained file shows
// its questions and creates a new question set and a questionnaire.

type Props = {
  project: string;
  groups: SetGroup[];
  /** The page's header (crumb, title, intro), shown above every step. */
  header?: ReactNode;
};

const FORM_PAGE = "qualify-page qualify-page--form qf-forms-page";
const WIDE_PAGE = "qualify-page qualify-page--wide qf-forms-page";

type SelfContained = { file: QuestionnaireFile; fileName: string; setName: string; questionnaireName: string };

export default function QuestionnaireImport({ project, groups, header }: Props) {
  const [reading, setReading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [builder, setBuilder] = useState<BuilderInit | null>(null);
  const [preview, setPreview] = useState<SelfContained | null>(null);
  const ids = useId();

  if (builder)
    return (
      <main className={WIDE_PAGE}>
        {header}
        <QuestionnaireBuilder project={project} groups={groups} initial={builder} />
      </main>
    );

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setMissing([]);
    setPreview(null);
    setReading(true);
    try {
      const data = new FormData();
      data.set("file", file);
      const read = await readQuestionnaireFile(data);
      if (!read.ok) {
        setError(read.error);
        setMissing(read.missing ?? []);
        return;
      }
      if (read.bundle === "references") setBuilder(read.open);
      else
        setPreview({
          file: read.file,
          fileName: read.fileName,
          setName: `${read.file.name} questions`,
          questionnaireName: read.file.name,
        });
    } finally {
      setReading(false);
    }
  };

  const create = async () => {
    if (!preview) return;
    setError(null);
    setCreating(true);
    try {
      const result = await importSelfContained(
        project,
        JSON.stringify(preview.file),
        preview.setName,
        preview.questionnaireName,
      );
      if (result?.error) setError(result.error);
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className={FORM_PAGE}>
      {header}
      <div className="qualify-form">
        <section className="qf-section">
          <div className="field">
            <label className="qf-field-label" htmlFor={`${ids}-file`}>
              Questionnaire file (.json)
            </label>
            <div className="qf-import-drop">
              <input
                id={`${ids}-file`}
                type="file"
                accept=".json"
                disabled={reading}
                onChange={(e) => pick(e.target.files?.[0])}
              />
            </div>
          </div>
          {reading && <p className="qf-help">Reading the file…</p>}
          {error && !preview && <div className="error">{error}</div>}
          {missing.length > 0 && (
            <ul className="qf-import-missing">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </section>

        {preview && (
          <section className="qf-section">
            <h2 className="qf-import-found">{`Found ${preview.file.items.length} questions in ${preview.fileName}`}</h2>
            <ol className="qf-builder-rows">
              {preview.file.items.map((item, i) => (
                <li key={`${item.scope}:${item.localId}:${i}`} className="qf-builder-row">
                  <span className="qf-builder-pos">{i + 1}</span>
                  <div className="qf-builder-row-body">
                    <span className="qf-question-text">{item.text}</span>
                    <div className="qf-builder-chips">
                      {item.citation && <span className="qf-citation">{item.citation}</span>}
                      {isAnnexPoint(item.annexPoint) && (
                        <span className="qf-overlap">{annexCitation(item.annexPoint)}</span>
                      )}
                      <span className="qf-tag">{item.required ? "Required" : "Optional"}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <div className="qf-builder-editor-pair">
              <div className="field">
                <label className="qf-field-label" htmlFor={`${ids}-set`}>
                  Question set name
                </label>
                <input
                  id={`${ids}-set`}
                  value={preview.setName}
                  maxLength={120}
                  onChange={(e) => setPreview({ ...preview, setName: e.target.value })}
                />
              </div>
              <div className="field">
                <label className="qf-field-label" htmlFor={`${ids}-questionnaire`}>
                  Questionnaire name
                </label>
                <input
                  id={`${ids}-questionnaire`}
                  value={preview.questionnaireName}
                  maxLength={120}
                  onChange={(e) => setPreview({ ...preview, questionnaireName: e.target.value })}
                />
              </div>
            </div>
            {error && <div className="error">{error}</div>}
            <div className="qf-actions">
              <button type="button" className="btn" disabled={creating} onClick={create}>
                Create question set and questionnaire
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
