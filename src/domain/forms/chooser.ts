// "Which questionnaire?": the option the chooser opens with, and which URL
// parameter the edit page looks up. A project's first card starts on the Annex
// IV default; every later card starts on the exact questionnaire version the
// previous card was filled with, so a card never moves to a newer version by
// itself (T37, D11).
import { findExample } from "@/data/examples";
import { DEFAULT_QUESTIONNAIRE_ID } from "./legacy";

export type ChooserPick = { param: "questionnaire" | "questionnaireVersion"; id: string };

/**
 * The option to start on. `options` are the listed, current questionnaires with
 * their latest version; `fromVersionId` is the version the previous card was
 * filled with (null for a first card).
 */
export function preselect(
  options: { questionnaireId: string; versionId: string }[],
  from: { fromVersionId: string | null },
): ChooserPick | null {
  const { fromVersionId } = from;
  if (fromVersionId !== null) {
    const latest = options.find((o) => o.versionId === fromVersionId);
    if (latest) return { param: "questionnaire", id: latest.questionnaireId };
    // An older version, a use-once or a retired one: that very version again.
    return { param: "questionnaireVersion", id: fromVersionId };
  }
  const fallback = options.find((o) => o.questionnaireId === DEFAULT_QUESTIONNAIRE_ID) ?? options[0];
  return fallback ? { param: "questionnaire", id: fallback.questionnaireId } : null;
}

export type QuestionnaireLookup =
  | { lookup: "example" }
  | { lookup: "version"; id: string }
  | { lookup: "latest"; id: string }
  | { lookup: "none" };

/**
 * What the edit page looks up (T39): a known ?example, else
 * ?questionnaireVersion, else ?formVersion (alias), else ?questionnaire, else
 * ?form (alias), else nothing (the chooser). An empty parameter counts as absent.
 */
export function pickQuestionnaireParams(p: {
  example?: string;
  questionnaire?: string;
  questionnaireVersion?: string;
  form?: string;
  formVersion?: string;
}): QuestionnaireLookup {
  if (p.example && findExample(p.example)) return { lookup: "example" };
  const version = p.questionnaireVersion || p.formVersion;
  if (version) return { lookup: "version", id: version };
  const latest = p.questionnaire || p.form;
  if (latest) return { lookup: "latest", id: latest };
  return { lookup: "none" };
}
