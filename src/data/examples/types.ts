// A filled form, ready to be loaded into the qualification form for review.
//
// This is for worked examples: a system described in enough detail to answer
// every question, so the form can be opened filled in and corrected rather than
// typed from scratch. It is not a seed and it writes nothing: the person still
// reads it and presses the button.
export type RiskExample = {
  risk: string;
  source: string;
  vulnerability: string;
  consequence: string;
  /** One of the AFFECTED vocabulary ids. */
  affected: string;
  /** VAIR AreaOfImpact terms. */
  areas: string[];
  control: string;
  followUpControl: string;
  /** The VAIR term of each typeable field ("" for none): RiskSource, Consequence, Impact,
   *  RiskControl. Absent on an example made before the form spoke VAIR. */
  sourceTerm?: string;
  consequenceTerm?: string;
  impactTerm?: string;
  controlTerm?: string;
  followUpControlTerm?: string;
};

export type FormExample = {
  metadata: {
    systemName: string;
    systemVersion: string;
    company: string;
    description: string;
    targetUseCase: string;
    targetUsers: string;
    intendedDeployers: string;
    /** VAIR AISystem and Purpose terms, "" when open; absent on an older example. */
    systemType?: string;
    purpose?: string;
    /** VAIR AIOperator terms for the provider and the deployer, "" when open. */
    providerTerm?: string;
    deployerTerm?: string;
    /** VAIR terms: AICapability, Domain, Modality, LocalityOfUse. */
    targetSystemTags: string[];
    sectorTags: string[];
    marketFormTags: string[];
    localityTags: string[];
  };
  /** Keyed by the form field name, `q:<group>:<id>`. */
  answers: Record<string, string>;
  risks: RiskExample[];
  /** The Components block's rows; absent on examples made before it. */
  components?: ComponentExample[];
};

/** A component row as the form starts from it. `key` is "" for a new row or a suggestion; a
 *  suggestion (from the filler's extraction) is shown as such until the author keeps it. `type`
 *  is one entry of the one Type list (componentFields.COMPONENT_TYPES), "" when not chosen. */
export type ComponentExample = {
  key: string;
  name: string;
  role: string;
  type: string;
  provider: "in_house" | "third_party";
  providerName: string;
  suggested?: boolean;
};
