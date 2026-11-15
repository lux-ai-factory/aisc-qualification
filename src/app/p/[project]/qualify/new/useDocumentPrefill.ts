import { useRef, useState } from "react";
import type { FormExample } from "@/data/examples";
import {
  currentAnswers,
  currentComponents,
  currentRisks,
  prefillableFor,
  prefillFormSpec,
} from "@/lib/prefillChoice";
import {
  applyDocument,
  checkDocument,
  type Reader,
  type UploadStatus,
} from "@/lib/prefillFlow";
import type {
  PrefillComponent,
  PrefillMode,
  PrefillPicks,
  PrefillRisk,
} from "@/server/services/PrefillClient";
import { readDocument } from "./prefill-actions";
import { DEFAULT_VERSION_ID } from "@/domain/forms/legacy";
import type { ResolvedQuestionnaireVersion } from "@/domain/forms/types";

/** The largest document the prefill service reads (its PREFILL_MAX_BYTES default). A larger
 *  file is refused here: past the server action's body limit Next refuses the request
 *  before the reader runs, and the page would get no answer it could read. */
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const TOO_LARGE =
  "This document is larger than 10 MB, the most that can be read. Choose a smaller file.";
/** The request did not come back: a lost connection, or a refusal on the way. */
const NOT_SENT =
  "The document could not be sent (files up to 10 MB). Check the connection and try again.";

/** The prefill server action, as the upload steps call it. For a form other
 *  than the default, the action is also told the form's fields and questions;
 *  for the default it is sent only the document, the mode and the current answers.
 *  It always answers: a file too large or a request that fails is an error to show. */
const readWithAction =
  (project: string, form: ResolvedQuestionnaireVersion | undefined): Reader =>
  async (file, mode, current, rows, parts) => {
    if (file.size > DOCUMENT_MAX_BYTES) return { ok: false, error: TOO_LARGE };
    const data = new FormData();
    data.set("document", file);
    data.set("mode", mode);
    data.set("current", JSON.stringify(current));
    data.set("current_risks", JSON.stringify(rows));
    data.set("current_components", JSON.stringify(parts));
    if (form && form.versionId !== DEFAULT_VERSION_ID) {
      const spec = prefillFormSpec(form);
      data.set("fields", JSON.stringify(spec.fields));
      data.set("questions", JSON.stringify(spec.questions));
    }
    let answer;
    try {
      answer = await readDocument(project, undefined, data);
    } catch (err) {
      console.error("document upload failed", err);
      return { ok: false, error: NOT_SENT };
    }
    return answer ?? { ok: false, error: "The document could not be read." };
  };

/**
 * Starting the form from a document.
 *
 * The reading happens in the prefill service; what comes back is applied to
 * the fields here, and the person amends it. The form is uncontrolled, so the
 * values are written onto its elements: React is not holding them and will not
 * put them back.
 */
/** Puts a document's VAIR picks on the form by the mode's rule, and says how many landed. */
export type PicksApplier = (
  picks: PrefillPicks,
  mode: PrefillMode,
  form: HTMLFormElement | null,
) => number;

export function useDocumentPrefill(
  /** The project the form saves into: the document reader asks about the caller in it. */
  project: string,
  initialRisks: FormExample["risks"] | undefined,
  form?: ResolvedQuestionnaireVersion,
  initialComponents?: FormExample["components"],
  applyPicks?: PicksApplier,
) {
  const formRef = useRef<HTMLFormElement>(null);
  const [upload, setUpload] = useState<UploadStatus>({ kind: "idle" });
  const [picked, setPicked] = useState<File | null>(null);
  // The risk rows keep their own state, so a document's rows are put in by
  // starting the block again from them.
  const [riskRows, setRiskRows] = useState<{
    version: number;
    rows?: PrefillRisk[];
  }>({
    version: 0,
    rows: initialRisks,
  });
  // The same for the Components block's rows.
  const [componentRows, setComponentRows] = useState<{
    version: number;
    rows?: PrefillComponent[];
  }>({
    version: 0,
    rows: initialComponents,
  });

  const formNow = () =>
    formRef.current ? new FormData(formRef.current) : null;
  const answersNow = () => {
    const data = formNow();
    return data
      ? currentAnswers(data, form ? prefillableFor(form) : undefined)
      : {};
  };
  const risksNow = () => {
    const data = formNow();
    return data ? currentRisks(data) : [];
  };
  const partsNow = () => {
    const data = formNow();
    return data ? currentComponents(data) : [];
  };

  const writeValues = (values: Record<string, string>) => {
    const form = formRef.current;
    for (const [name, value] of Object.entries(values)) {
      const field = form?.elements.namedItem(name);
      if (
        field instanceof HTMLInputElement ||
        field instanceof HTMLTextAreaElement
      ) {
        field.value = value;
        // said as input, so what follows the field (the description's count) sees the new value
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
  };

  const land = (
    outcome: Awaited<ReturnType<typeof applyDocument>>,
    mode: PrefillMode,
  ) => {
    if (outcome.kind === "error") return setUpload(outcome);
    writeValues(outcome.values);
    const picks = applyPicks
      ? applyPicks(outcome.picks, mode, formRef.current)
      : 0;
    if (outcome.risks) {
      const rows = outcome.risks;
      setRiskRows((r) => ({ version: r.version + 1, rows }));
    }
    if (outcome.components) {
      const rows = outcome.components;
      setComponentRows((r) => ({ version: r.version + 1, rows }));
    }
    setUpload({
      kind: "applied",
      filled: outcome.filled,
      kept: outcome.kept,
      risks: outcome.risks?.length ?? 0,
      risksKept: outcome.risksKept,
      components: outcome.components?.length ?? 0,
      componentsKept: outcome.componentsKept,
      picks,
    });
  };

  const pickDocument = async (file: File) => {
    setPicked(file);
    setUpload({ kind: "reading" });
    const checked = await checkDocument(
      file,
      answersNow(),
      risksNow(),
      readWithAction(project, form),
      partsNow(),
    );
    // An empty form: the careful choice is the only one there is.
    if (checked.kind === "apply") land(checked, "empty");
    else setUpload(checked);
  };

  const chooseMode = async (mode: PrefillMode) => {
    if (!picked) return;
    setUpload({ kind: "reading" });
    land(
      await applyDocument(
        picked,
        mode,
        answersNow(),
        risksNow(),
        readWithAction(project, form),
        partsNow(),
      ),
      mode,
    );
  };

  return { formRef, upload, riskRows, componentRows, pickDocument, chooseMode };
}
