"use server";

import { redirect } from "next/navigation";
import type { FormBlock } from "@/domain/forms/blocks";
import type { ReferenceItem } from "@/domain/forms/references";
import type { ResolvedQuestion } from "@/domain/forms/types";
import { callerName } from "@/server/access/callerName";
import { projectDbForAction } from "@/lib/projectDb";
import { questionnairesOn, type SelfContainedFile } from "@/server/services/QuestionnaireService";
import { questionnaireFileClient, type QuestionnaireFile } from "@/server/services/QuestionnaireFileClient";
import type { FormsRecorder } from "@/server/services/QuestionSetService";
import { emitEvent } from "@/server/ledger/emit";

/** The ledger's events for an import: the set and the questionnaire it makes. */
const recordImport: FormsRecorder = async (tx, saved) => {
  if (saved.set) {
    await emitEvent(tx, { action: "question_set.created", itemType: "question_set", itemId: saved.set.id,
      details: { version: saved.set.number }, content: saved.set.content });
  }
  if (saved.questionnaire) {
    await emitEvent(tx, { action: "questionnaire.created", itemType: "questionnaire", itemId: saved.questionnaire.id,
      details: { version: saved.questionnaire.number }, content: saved.questionnaire.content });
  }
};


const MISSING =
  "This questionnaire refers to questions this install does not have. Import its self-contained file, or import those question sets first.";

export type ReadQuestionnaireResult =
  | {
      ok: true;
      bundle: "references";
      open: {
        name: string;
        blocks: FormBlock[];
        origin: "import";
        picks: Array<{ question: ResolvedQuestion; setVersionId: string }>;
      };
    }
  | { ok: true; bundle: "self-contained"; file: QuestionnaireFile; fileName: string }
  | { ok: false; error: string; missing?: string[] };

/**
 * Read a questionnaire file. Nothing is stored here: a references
 * file whose set versions are all in this project opens the builder with its
 * picks; a self-contained file goes back for the create-both preview.
 */
export async function readQuestionnaireFile(project: string, formData: FormData): Promise<ReadQuestionnaireResult> {
  const door = await projectDbForAction(project, { write: false });
  if (door.error !== undefined) return { ok: false, error: door.error };
  const upload = formData.get("file");
  if (!(upload instanceof File) || upload.size === 0) return { ok: false, error: "Choose a file first." };
  const read = await questionnaireFileClient.read(upload);
  if (!read.ok) return { ok: false, error: read.error };
  const file = read.file;
  if (file.bundle === "self-contained") return { ok: true, bundle: "self-contained", file, fileName: upload.name };

  const resolved = await questionnairesOn(door.db).resolveReferences(file.items as ReferenceItem[]);
  if (!resolved.ok) return { ok: false, error: MISSING, missing: resolved.missing };
  return {
    ok: true,
    bundle: "references",
    open: { name: file.name, blocks: file.blocks as FormBlock[], origin: "import", picks: resolved.picks },
  };
}

/**
 * Create the question set and the questionnaire a self-contained file holds,
 * in one transaction, then open the card form on the questionnaire.
 */
export async function importSelfContained(
  project: string,
  fileJson: string,
  setName: string,
  questionnaireName: string,
): Promise<{ error?: string }> {
  const door = await projectDbForAction(project, { write: true });
  if (door.error !== undefined) return { error: door.error };
  let file: SelfContainedFile;
  try {
    file = JSON.parse(fileJson) as SelfContainedFile;
  } catch {
    return { error: "The questionnaire file could not be read." };
  }
  if (!file || typeof file !== "object" || !Array.isArray(file.items)) {
    return { error: "The questionnaire file could not be read." };
  }
  const saved = await questionnairesOn(door.db).importSelfContained(file, {
    setName,
    questionnaireName,
    createdBy: await callerName(),
    record: recordImport,
  });
  if (!saved.ok) return { error: saved.error };
  redirect(`/p/${project}/system/edit?questionnaire=${encodeURIComponent(saved.questionnaireId)}`);
}
