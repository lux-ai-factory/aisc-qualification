// The card's Components block: one row per part of the system. Each row keeps a stable key from
// one card version to the next, so an assessment and its results can name the part they are
// about. Every card has this block, whatever its questionnaire, like the identity.
//
// A row's type comes from one list: VAIR's AIComponent terms first, then ours for what VAIR has
// no term for. The type decides the stored `kind` (the platform's assessment targets read it) and
// the VAIR type: a term under vair:Model is kind `model`, any other VAIR term kind `other`.
import { COMPONENT_TERMS, MODEL_TERMS, vairLabel } from "./vairVocab";

export type ComponentKindId =
  | "model"
  | "rule_engine"
  | "llm"
  | "training_data"
  | "validation_data"
  | "other_data"
  | "pipeline"
  | "interface"
  | "other";

/** Every kind, with the label the card shows for it. `model` is reached only through a VAIR
 *  Model term. Each maps to an AIRO class in the graph builder (services/ontology/airo_min/build.py,
 *  COMPONENT_KINDS). */
export const COMPONENT_KINDS: { id: ComponentKindId; label: string }[] = [
  { id: "model", label: "Predictive model" },
  { id: "rule_engine", label: "Rule engine" },
  { id: "llm", label: "LLM or foundation model" },
  { id: "training_data", label: "Training data" },
  { id: "validation_data", label: "Validation data" },
  { id: "other_data", label: "Other data (e.g. a retrieval corpus)" },
  { id: "pipeline", label: "Data pipeline" },
  { id: "interface", label: "Interface or service" },
  { id: "other", label: "Other" },
];

/** Our own types: only the parts VAIR has no AIComponent term for. */
const OWN_TYPES: ComponentKindId[] = [
  "llm", "rule_engine", "training_data", "validation_data", "other_data", "pipeline", "interface", "other",
];

export type ComponentType = { id: string; label: string; vair: boolean; definition?: string };

/** The Type list, in the order the form offers it. */
export const COMPONENT_TYPES: ComponentType[] = [
  ...COMPONENT_TERMS.map((t) => ({ id: t.id, label: t.label, vair: true, definition: t.definition })),
  ...OWN_TYPES.map((id) => ({ id, label: COMPONENT_KINDS.find((k) => k.id === id)!.label, vair: false })),
];

/** What a chosen type is stored as; null for a type that is not on the list. */
export function typeToKind(type: string): { kind: ComponentKindId; vairType: string | null } | null {
  if (COMPONENT_TERMS.some((t) => t.id === type)) {
    return { kind: MODEL_TERMS.has(type) ? "model" : "other", vairType: type };
  }
  if ((OWN_TYPES as string[]).includes(type)) return { kind: type as ComponentKindId, vairType: null };
  return null;
}

/** The type a stored row was given: its VAIR term, or its kind when it is one of ours. */
export function componentType(kind: string, vairType: string | null | undefined): string {
  return vairType || kind;
}

/** What the card calls a stored row's type. */
export function componentTypeLabel(kind: string, vairType: string | null | undefined): string {
  if (vairType) return vairLabel("AIComponent", vairType);
  return COMPONENT_KINDS.find((k) => k.id === kind)?.label ?? kind;
}

export const COMPONENT_PROVIDERS = [
  { id: "in_house", label: "In-house" },
  { id: "third_party", label: "Third party" },
] as const;

export const COMPONENT_BLOCK = {
  title: "Components",
  citation: "Annex IV(2)(b), (2)(c)",
  help:
    "One row per part of the system: its models, rule engines, LLMs, the data it is trained or validated on, " +
    "its pipelines and interfaces. Each part can then be the target of an assessment. A test set is not a " +
    "component: it is what an assessment uses.",
};

export const COMPONENT_NAME_MAX = 120;

export function isComponentKind(s: unknown): s is ComponentKindId {
  return typeof s === "string" && COMPONENT_KINDS.some((k) => k.id === s);
}
