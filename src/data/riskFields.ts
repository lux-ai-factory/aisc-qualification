// Question 15: the risk block. One row per risk; each field maps to one step of
// the AIRO risk chain (see services/ontology/airo_min/mapping.py).
//
// VAIR has precedence: a text field whose node VAIR can type has one VAIR select
// beside it (`<id>Term`), and the harm, which has no text of its own, is a VAIR select alone.
// A term is required where VAIR always has one that fits; the consequence's is optional.
import type { VairClass } from "./vairVocab";

export type RiskFieldKind = "text" | "affected" | "areas" | "term";

export type RiskField = {
  id:
    | "risk"
    | "source"
    | "vulnerability"
    | "consequence"
    | "impact"
    | "affected"
    | "area"
    | "control"
    | "followUpControl";
  label: string;
  citation: string;
  kind: RiskFieldKind;
  optional?: boolean;
  placeholder?: string;
  /** The VAIR class of the field's node: a text field then has one VAIR select beside it, named
   *  `<id>Term` (the harm, kind "term", is only that select, named `impactTerm`). */
  vair?: VairClass;
  /** The VAIR select may be left open: VAIR's list does not cover every case. */
  termOptional?: boolean;
};

export const RISK_BLOCK = {
  title: "Risks",
  citation: "Art 9(2); Annex IV 5",
  help: "One row per risk. Say what could go wrong, why, what follows, who and what it affects, and what you do about it.",
};

export const RISK_FIELDS: RiskField[] = [
  {
    id: "risk",
    label: "What could go wrong",
    citation: "Art 9(2)(a); Art 3(2)",
    kind: "text",
    placeholder: "e.g. an out-of-stock alert is raised for a full shelf",
  },
  {
    id: "source",
    label: "What causes it",
    citation: "Art 9(2)(a)-(b)",
    kind: "text",
    placeholder: "e.g. poor lighting, occlusion, a moved camera",
    vair: "RiskSource",
  },
  {
    id: "vulnerability",
    label: "Which weakness in the system makes it possible",
    citation: "Art 15(5)",
    kind: "text",
    optional: true,
    placeholder: "e.g. the model was not trained on low-light images",
  },
  {
    id: "consequence",
    label: "What happens as a result",
    citation: "Art 9(2)(a); Art 15(1)",
    kind: "text",
    placeholder: "e.g. staff are sent to check a shelf that is fine",
    vair: "Consequence",
    termOptional: true,
  },
  {
    id: "impact",
    label: "Kind of harm",
    citation: "Art 9(2)(a)",
    kind: "term",
    vair: "Impact",
  },
  {
    id: "affected",
    label: "Who is affected",
    citation: "Annex IV 2(b); Art 9(9)",
    kind: "affected",
  },
  {
    id: "area",
    label: "What is affected",
    citation: "Art 9(2)(a)",
    kind: "areas",
  },
  {
    id: "control",
    label: "What you do about it",
    citation: "Art 9(2)(d)",
    kind: "text",
    placeholder:
      "e.g. confidence threshold plus human confirmation before action",
    vair: "RiskControl",
  },
  {
    id: "followUpControl",
    label: "If that is not enough, what follows",
    citation: "Art 9(5); Art 14(4)(e)",
    kind: "text",
    optional: true,
    placeholder: "e.g. mute the camera and fall back to manual checks",
    vair: "RiskControl",
  },
];
