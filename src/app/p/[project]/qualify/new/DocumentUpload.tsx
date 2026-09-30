"use client";

/**
 * Upload the document you already wrote, and the form fills itself in.
 *
 * The reading happens in the prefill service; this is the part the person
 * sees. Choosing a file reads it. A file that cannot be read says why. When
 * the form already has answers, two buttons ask what to do with them, and the
 * one pressed is what applies the document: an upload that silently replaced
 * somebody's typing would be the wrong thing to be fast at.
 */
import type { PrefillMode } from "@/server/services/PrefillClient";
import type { UploadStatus } from "@/lib/prefillFlow";

export type DocumentUploadProps = {
  status: UploadStatus;
  /** a file was chosen: read it */
  onPick: (file: File) => void;
  /** one of the two buttons was pressed */
  onChoose: (mode: PrefillMode) => void;
};

export default function DocumentUpload({ status, onPick, onChoose }: DocumentUploadProps) {
  return (
    <section className="qf-section qf-prefill">
      <h2>Start from a document</h2>
      <p className="qf-hint">
        If the system is already written up somewhere, upload it and the answers
        below are filled in from it. You can change any of them before saving.
        PDF, Word, text or markdown.
      </p>

      <div className="field">
        <label htmlFor="document">Document</label>
        <input
          id="document"
          type="file"
          accept=".pdf,.docx,.txt,.md,.markdown"
          disabled={status.kind === "reading"}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) onPick(file);
          }}
        />
      </div>

      {status.kind === "reading" && <p className="qf-note">Reading the document…</p>}

      {status.kind === "error" && <p className="qf-error">{status.error}</p>}

      {status.kind === "nothing" && (
        <p className="qf-note">
          There was nothing in that document this form could use. The headings it
          looks for are the Annex IV points, and labels like &quot;System
          name:&quot;.
        </p>
      )}

      {status.kind === "choose" && (
        <div className="qf-prefill-mode">
          <p>
            The document has {counted(status.proposed, status.risksProposed, status.componentsProposed)} for this form,
            and the form already has{" "}
            {counted(status.answered, status.risksAnswered, status.componentsAnswered)} in it. What
            should the document do with them?
          </p>
          <div className="qf-actions">
            <button className="btn btn-primary" type="button" onClick={() => onChoose("empty")}>
              Fill only the empty ones
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => onChoose("replace")}>
              Replace my answers
            </button>
          </div>
        </div>
      )}

      {status.kind === "applied" && (
        <p className="qf-note">
          Filled {counted(status.filled.length, status.risks, status.components, status.picks)} from the document
          {status.kept.length > 0 && (
            <>
              , left {status.kept.length} as {status.kept.length === 1 ? "it was" : "they were"}
            </>
          )}
          {status.risksKept && <>, and left your risks as they were</>}
          {status.componentsKept && <>, and left your components as they were</>}
          . Read them before saving.
        </p>
      )}
    </section>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "21 answers, 5 risks and 9 components", leaving out the rows there are none of. */
function counted(answers: number, risks: number, components = 0, picks = 0): string {
  const parts = [plural(answers, "answer", "answers")];
  if (risks > 0) parts.push(plural(risks, "risk", "risks"));
  if (components > 0) parts.push(plural(components, "component", "components"));
  if (picks > 0) parts.push(plural(picks, "choice from the lists", "choices from the lists"));
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
