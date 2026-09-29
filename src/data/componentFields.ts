// The card's Components block (targets plan v2, 2026-09-29): one row per part of the system. Each
// row keeps a stable key from one card version to the next, so an assessment, and its results,
// can name the part it is about. On every card, whatever its questionnaire, like the identity.

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

/** In the order the form offers them. Each maps to an AIRO class in the graph builder
 *  (services/ontology/airo_min/build.py, COMPONENT_KINDS). */
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
