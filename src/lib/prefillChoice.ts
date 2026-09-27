/**
 * What the form holds now, and whether an upload has to ask before it lands.
 *
 * The rule the person sees: an empty form is simply filled, and a form with
 * answers in it asks first, because there is something to lose. Both of those
 * are decided here so the component only renders the choice.
 */
import { KEY_QUESTIONS, keyQuestionField } from "@/data/keyQuestions";
import type { RiskExample } from "@/data/examples";
import { IDENTITY_FIELDS } from "@/domain/forms/blocks";
import type { ResolvedQuestionnaireVersion } from "@/domain/forms/types";

/** The seven metadata fields a document can propose. The tag pickers are
 *  chosen rather than written, so nothing proposes them. */
export const METADATA_FIELDS = [
  "systemName",
  "systemVersion",
  "company",
  "description",
  "targetUseCase",
  "targetUsers",
  "intendedDeployers",
] as const;

export const PREFILLABLE = new Set<string>([
  ...METADATA_FIELDS,
  ...KEY_QUESTIONS.map(keyQuestionField),
]);

/** The metadata text fields a form includes or leaves out as blocks. */
const TEXT_BLOCKS = new Set<string>(["description", "targetUseCase", "targetUsers", "intendedDeployers"]);

/** What a document may propose for this questionnaire version: the identity, the
 *  included metadata text fields and every question. For the default version
 *  this is exactly PREFILLABLE. */
export function prefillableFor(form: ResolvedQuestionnaireVersion): Set<string> {
  return new Set<string>([
    ...IDENTITY_FIELDS,
    ...form.blocks.filter((b) => TEXT_BLOCKS.has(b)),
    ...form.questions.map((q) => q.field),
  ]);
}

/** The form being filled, as the prefill service is told it: the fields it may
 *  fill ("risks" only when the form has the risk block) and the questions. */
export type PrefillFormSpec = {
  fields: string[];
  questions: { field: string; text: string; citation: string; annexPoint: string | null }[];
};

export function prefillFormSpec(form: ResolvedQuestionnaireVersion): PrefillFormSpec {
  return {
    fields: [...IDENTITY_FIELDS, ...form.blocks, ...form.questions.map((q) => q.field)],
    questions: form.questions.map((q) => ({
      field: q.field,
      text: q.text,
      citation: q.citation,
      annexPoint: q.annexPoint,
    })),
  };
}

export type Answers = Record<string, string>;

/** What the form holds now, limited to what a document could propose. */
export function currentAnswers(form: FormData, prefillable: Set<string> = PREFILLABLE): Answers {
  const found: Answers = {};
  for (const [name, value] of form.entries()) {
    if (typeof value !== "string") continue;
    if (!prefillable.has(name)) continue;
    found[name] = value;
  }
  return found;
}

/** The fields that have something in them, sorted, for telling the person. */
export function answeredFields(current: Answers): string[] {
  return Object.entries(current)
    .filter(([, value]) => value.trim() !== "")
    .map(([name]) => name)
    .sort();
}

/** Whether to ask what should happen to the answers already there. */
export function needsAChoice(current: Answers): boolean {
  return answeredFields(current).length > 0;
}

function emptyRisk(): RiskExample {
  return {
    risk: "",
    source: "",
    vulnerability: "",
    consequence: "",
    affected: "",
    areas: [],
    control: "",
    followUpControl: "",
  };
}

/** The risk rows the form holds now, in the order they are on it. Rows arrive
 *  as `risk:<key>:<field>`, with `risk:<key>:area` repeated. */
export function currentRisks(form: FormData): RiskExample[] {
  const rows = new Map<number, RiskExample>();
  for (const [name, value] of form.entries()) {
    const m = /^risk:(\d+):(\w+)$/.exec(name);
    if (!m || typeof value !== "string") continue;
    const key = Number(m[1]);
    let row = rows.get(key);
    if (!row) {
      row = emptyRisk();
      rows.set(key, row);
    }
    if (m[2] === "area") row.areas.push(value);
    else if (m[2] in row && m[2] !== "areas") (row as Record<string, unknown>)[m[2]] = value;
  }
  return [...rows.values()];
}

/** Whether a row has anything written or chosen in it. */
export function riskWritten(row: RiskExample): boolean {
  return Object.values(row).some((v) => (Array.isArray(v) ? v.length > 0 : String(v).trim() !== ""));
}
