// Labels and EU AI Act citations for the metadata section. Every element on the
// form traces to the Act; the citation renders as a chip next to the label.
export type MetadataFieldId =
  | "systemName"
  | "systemVersion"
  | "company"
  | "description"
  | "targetUseCase"
  | "targetUsers"
  | "intendedDeployers"
  | "systemType"
  | "purpose"
  | "targetSystemTags"
  | "sectorTags"
  | "marketFormTags"
  | "localityTags";

export const METADATA_FIELDS: Record<
  MetadataFieldId,
  { label: string; citation: string }
> = {
  systemName: { label: "System name", citation: "Annex IV 1(a)" },
  systemVersion: { label: "Version", citation: "Annex IV 1(a)" },
  company: { label: "Company (provider)", citation: "Annex IV 1(a); Art 3(3)" },
  description: {
    label: "Short description",
    citation: "Art 3(12); Annex IV 1(a)",
  },
  targetUseCase: {
    label: "Target use case",
    citation: "Art 3(12); Annex IV 1(a)",
  },
  targetUsers: {
    label: "Target users and people affected",
    citation: "Annex IV 2(b); Annex IV 1(g)",
  },
  intendedDeployers: {
    label: "Intended deployers",
    citation: "Art 3(4); Annex IV 1(h)",
  },
  // The VAIR fields (2026-09-30): each offers VAIR's own list.
  systemType: {
    label: "Type of AI system",
    citation: "Art 3(1)",
  },
  purpose: {
    label: "Intended purpose",
    citation: "Art 3(12); Annex III",
  },
  targetSystemTags: {
    label: "Capabilities",
    citation: "Art 3(1); Annex IV 2(b)",
  },
  sectorTags: {
    label: "Application domains",
    citation: "Annex III; Annex IV 1(a)",
  },
  marketFormTags: {
    label: "How the system reaches the market",
    citation: "Annex IV 1(d); Art 6(1)",
  },
  localityTags: {
    label: "Where the system is used",
    citation: "Art 3(44); Art 5(1)(f)",
  },
};
