// Question 15: the risk block. One row per risk; each field maps to one step of
// the AIRO risk chain (see services/ontology/airo_min/mapping.py).
export type RiskFieldKind = "text" | "affected" | "areas";

export type RiskField = {
  id:
    | "risk"
    | "source"
    | "vulnerability"
    | "consequence"
    | "affected"
    | "area"
    | "control"
    | "followUpControl";
  label: string;
  citation: string;
  kind: RiskFieldKind;
  optional?: boolean;
  placeholder?: string;
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
  },
  {
    id: "followUpControl",
    label: "If that is not enough, what follows",
    citation: "Art 9(5); Art 14(4)(e)",
    kind: "text",
    optional: true,
    placeholder: "e.g. mute the camera and fall back to manual checks",
  },
];
