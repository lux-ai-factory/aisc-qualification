"use client";

import { useId, useState, type ReactNode } from "react";
import { ANNEX_POINTS, isAnnexPoint } from "@/domain/forms/annexPoints";
import type { SetEditorInit } from "@/domain/forms/setEditorState";
import type { ImportedQuestion } from "@/server/services/FormImportClient";
import QuestionSetEditor from "../QuestionSetEditor";
import { readQuestionSetFile } from "./actions";

// Importing a question-set file: upload it, check and correct what was
// read, then go on in the set editor. Nothing is stored before the editor's
// save. The page stays a form's width throughout.

type Props = {
  project: string;
  /** The page's header (crumb, title, intro), shown above either step. */
  header?: ReactNode;
};

const FORM_PAGE = "qualify-page qualify-page--form qf-forms-page";

type Preview = {
  fileName: string;
  found: number;
  warnings: string[];
  rows: (ImportedQuestion & { key: number })[];
};

/** "Acme policy.docx" -> "Acme policy": the set's name starts as the file's. */
const nameOf = (fileName: string) => {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
};

export default function QuestionSetImport({ project, header }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [editor, setEditor] = useState<SetEditorInit | null>(null);
  const ids = useId();

  if (editor)
    return (
      <main className={FORM_PAGE}>
        {header}
        <QuestionSetEditor project={project} initial={editor} />
      </main>
    );

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setReading(true);
    try {
      const data = new FormData();
      data.set("file", file);
      const read = await readQuestionSetFile(project, data);
      if (!read.ok) {
        setError(read.error);
        return;
      }
      setPreview({
        fileName: file.name,
        found: read.found,
        warnings: read.warnings,
        rows: read.questions.map((q, key) => ({
          ...q,
          annexPoint: isAnnexPoint(q.annexPoint) ? q.annexPoint : null,
          key,
        })),
      });
    } finally {
      setReading(false);
    }
  };

  const change = (key: number, over: Partial<ImportedQuestion>) =>
    setPreview(
      (p) =>
        p && {
          ...p,
          rows: p.rows.map((r) => (r.key === key ? { ...r, ...over } : r)),
        },
    );
  const remove = (key: number) =>
    setPreview((p) => p && { ...p, rows: p.rows.filter((r) => r.key !== key) });

  const confirm = () => {
    if (!preview) return;
    setEditor({
      name: nameOf(preview.fileName),
      origin: "import",
      rows: preview.rows.map((r) => ({
        text: r.text,
        citation: r.citation,
        required: r.required,
        annexPoint: r.annexPoint,
      })),
    });
  };

  return (
    <main className={FORM_PAGE}>
      {header}
      <div className="qualify-form">
        <section className="qf-section">
          <div className="field">
            <label className="qf-field-label" htmlFor="form-file">
              Question set file (CSV, Markdown or Word)
            </label>
            <div className="qf-import-drop">
              <input
                id="form-file"
                type="file"
                accept=".csv,.md,.markdown,.docx"
                disabled={reading}
                onChange={(e) => pick(e.target.files?.[0])}
              />
            </div>
          </div>
          {reading && <p className="qf-help">Reading the file…</p>}
          {error && <div className="error">{error}</div>}
        </section>

        {preview && (
          <section className="qf-section">
            <h2 className="qf-import-found">{`Found ${preview.found} questions in ${preview.fileName}`}</h2>
            {preview.warnings.length > 0 && (
              <ul className="qf-import-warnings">
                {preview.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <ol className="qf-import-rows">
              {preview.rows.map((r, i) => (
                <li className="qf-import-row" key={r.key}>
                  <span className="qf-builder-pos">{i + 1}</span>
                  <input
                    className="qf-import-text"
                    aria-label={`Question ${i + 1}`}
                    value={r.text}
                    maxLength={2000}
                    onChange={(e) => change(r.key, { text: e.target.value })}
                  />
                  <button
                    type="button"
                    className="qf-builder-tool qf-builder-remove"
                    onClick={() => remove(r.key)}
                  >
                    Remove
                  </button>
                  <div className="qf-import-meta">
                    <input
                      className="qf-import-cite"
                      aria-label={`Citation of question ${i + 1}`}
                      placeholder="Citation"
                      value={r.citation}
                      maxLength={200}
                      onChange={(e) =>
                        change(r.key, { citation: e.target.value })
                      }
                    />
                    <div className="qf-import-point">
                      <label
                        className="qf-field-label"
                        htmlFor={`${ids}-point-${r.key}`}
                      >
                        Answers Annex IV point
                      </label>
                      <select
                        id={`${ids}-point-${r.key}`}
                        className="qf-select"
                        value={r.annexPoint ?? ""}
                        onChange={(e) =>
                          change(r.key, {
                            annexPoint: isAnnexPoint(e.target.value)
                              ? e.target.value
                              : null,
                          })
                        }
                      >
                        <option value="">None</option>
                        {ANNEX_POINTS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.citation}
                          </option>
                        ))}
                      </select>
                    </div>
                    <label className="qf-builder-check">
                      <input
                        type="checkbox"
                        checked={r.required}
                        onChange={(e) =>
                          change(r.key, { required: e.target.checked })
                        }
                      />
                      Required
                    </label>
                  </div>
                </li>
              ))}
            </ol>
            <div className="qf-actions">
              <button
                type="button"
                className="btn"
                disabled={preview.rows.length === 0}
                onClick={confirm}
              >
                {`Continue with ${preview.rows.length} questions`}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
