// The VAIR lists the form offers (2026-09-30). VAIR has precedence: wherever it has a vocabulary
// for a field, the form offers only VAIR's terms. vair_vocab.json is generated from the vendored
// vair.ttl by services/ontology (python -m airo_min.vair_vocab --write), the same terms the graph
// builder accepts, so the form cannot offer a term the builder would refuse.
import vocab from "./vair_vocab.json";

export type VairTerm = { id: string; label: string; definition: string };

/** The AIRO classes a form field takes its list from. */
export type VairClass =
  | "AISystem"
  | "Purpose"
  | "AICapability"
  | "Domain"
  | "Modality"
  | "LocalityOfUse"
  | "AIComponent"
  | "RiskSource"
  | "Consequence"
  | "Impact"
  | "AreaOfImpact"
  | "RiskControl"
  | "AIOperator"
  | "AISubject";

const CLASSES = vocab.classes as Record<VairClass, VairTerm[]>;

export function vairTerms(cls: VairClass): VairTerm[] {
  return CLASSES[cls];
}

export const SYSTEM_TYPES = vairTerms("AISystem");
export const PURPOSES = vairTerms("Purpose");
export const CAPABILITIES = vairTerms("AICapability");
export const DOMAINS = vairTerms("Domain");
export const MODALITIES = vairTerms("Modality");
export const LOCALITIES = vairTerms("LocalityOfUse");
export const COMPONENT_TERMS = vairTerms("AIComponent");
export const RISK_SOURCES = vairTerms("RiskSource");
export const CONSEQUENCES = vairTerms("Consequence");
export const IMPACTS = vairTerms("Impact");
export const IMPACT_AREAS = vairTerms("AreaOfImpact");
export const RISK_CONTROLS = vairTerms("RiskControl");
export const OPERATORS = vairTerms("AIOperator");
export const SUBJECTS = vairTerms("AISubject");

/** The AIComponent terms that are models: vair:Model and everything under it. */
export const MODEL_TERMS: ReadonlySet<string> = new Set(vocab.modelTerms);

export function isVairTerm(cls: VairClass, id: string): boolean {
  return CLASSES[cls].some((t) => t.id === id);
}

/** The term's VAIR label; the id itself for one VAIR does not define under that class. */
export function vairLabel(cls: VairClass, id: string): string {
  return CLASSES[cls].find((t) => t.id === id)?.label ?? id;
}
