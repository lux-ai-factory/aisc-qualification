
import { useRef, useState } from "react";
import type { FormExample } from "@/data/examples";
import { currentAnswers, currentComponents, currentRisks, prefillableFor, prefillFormSpec } from "@/lib/prefillChoice";
import { applyDocument, checkDocument, type Reader, type UploadStatus } from "@/lib/prefillFlow";
import type { PrefillComponent, PrefillMode, PrefillPicks, PrefillRisk } from "@/server/services/PrefillClient";
import { readDocument } from "./prefill-actions";
import { DEFAULT_VERSION_ID } from "@/domain/forms/legacy";
import type { ResolvedQuestionnaireVersion } from "@/domain/forms/types";

/** The prefill server action, as the upload steps call it. For a form other
 *  than the default, the action is also told the form's fields and questions;
 *  for the default it is asked exactly what it was asked before forms existed. */
const readWithAction =
  (form: ResolvedQuestionnaireVersion | undefined): Reader =>
  async (file, mode, current, rows, parts) => {
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
    return (await readDocument(undefined, data)) ?? { ok: false, error: "The document could not be read." };
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
export type PicksApplier = (picks: PrefillPicks, mode: PrefillMode, form: HTMLFormElement | null) => number;

export function useDocumentPrefill(
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
  const [riskRows, setRiskRows] = useState<{ version: number; rows?: PrefillRisk[] }>({
    version: 0,
    rows: initialRisks,
  });
  // The same for the Components block's rows.
  const [componentRows, setComponentRows] = useState<{ version: number; rows?: PrefillComponent[] }>({
    version: 0,
    rows: initialComponents,
  });

  const formNow = () => (formRef.current ? new FormData(formRef.current) : null);
  const answersNow = () => {
    const data = formNow();
    return data ? currentAnswers(data, form ? prefillableFor(form) : undefined) : {};
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
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
        field.value = value;
      }
    }
  };

  const land = (outcome: Awaited<ReturnType<typeof applyDocument>>, mode: PrefillMode) => {
    if (outcome.kind === "error") return setUpload(outcome);
    writeValues(outcome.values);
    const picks = applyPicks ? applyPicks(outcome.picks, mode, formRef.current) : 0;
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
    const checked = await checkDocument(file, answersNow(), risksNow(), readWithAction(form), partsNow());
    // An empty form: the careful choice is the only one there is.
    if (checked.kind === "apply") land(checked, "empty");
    else setUpload(checked);
  };

  const chooseMode = async (mode: PrefillMode) => {
    if (!picked) return;
    setUpload({ kind: "reading" });
    land(await applyDocument(picked, mode, answersNow(), risksNow(), readWithAction(form), partsNow()), mode);
  };

  return { formRef, upload, riskRows, componentRows, pickDocument, chooseMode };
}
