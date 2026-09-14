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
  /** IMPACT_AREAS ids. */
  areas: string[];
  control: string;
  followUpControl: string;
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
    targetSystemTags: string[];
    sectorTags: string[];
    marketFormTags: string[];
    localityTags: string[];
  };
  /** Keyed by the form field name, `q:<group>:<id>`. */
  answers: Record<string, string>;
  risks: RiskExample[];
};
