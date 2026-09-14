import type { FormExample } from "./types";

// A worked example, so the form can be opened filled in and read rather than
// typed from scratch. MicroCredit Assist Score is invented: it is the same
// system the seed scripts and the ontology fixtures in services/ontology/examples
// use, a consumer credit scorer detailed enough to exercise every question and a
// full risk chain, and it describes no real company or deployment.
export const MCAS: FormExample = {
  metadata: {
    systemName: "MicroCredit Assist Score (MCAS)",
    systemVersion: "v1.2.0",
    company: "Creditum AI SARL (Luxembourg)",
    description: "Credit scoring system that evaluates creditworthiness for short-term consumer loans (€100–€5,000). It combines a gradient-boosted decision tree on applicant data with an LLM chatbot that produces natural-language explanations and answers customer questions from policy documentation. Licensing: proprietary, on-premise with audit access. Documentation: https://docs.microcreditassist.ai (public technical docs, API specs, deployment guides).",
    targetUseCase: "Retail banking and consumer micro-finance in the EU (deployed in Germany, France, and the Netherlands). Evaluates creditworthiness for €100–€5,000 consumer loans, returns a 0–1000 credit score, a Low/Medium/High risk category, and an Approve/Review/Reject recommendation, alongside influential factors and a natural-language explanation surfaced via the bank's web portal, mobile app, and staff dashboard. The subjects of the system are individual loan applicants whose access to credit is affected by its outputs.",
    targetUsers: "Primary: bank customers aged 18+ applying for consumer loans through the bank's web portal or mobile app. Secondary: bank loan officers and compliance staff who monitor decisions, conduct manual reviews of borderline cases, and can approve, reject, or override outcomes with mandatory written justification.",
    intendedDeployers: "Retail banks and consumer micro-finance providers licensed in DE, FR and NL, who run MCAS inside their own data centre and inside their own lending workflow. Each deployer configures the Approve/Review/Reject thresholds to its own risk appetite, staffs the Review queue with its own trained loan officers, and remains the controller for applicant data. Creditum AI SARL never operates the system on a deployer's behalf and never sees applicant-level data.",
    targetSystemTags: [
      "tabular-structured-data:tabular-classification-regression",
      "predictive-analytical-ai:risk-scoring-assessment",
      "predictive-analytical-ai:predictive-analytics",
      "natural-language-processing:text-generation-summarization",
      "natural-language-processing:question-answering",
      "knowledge-retrieval:retrieval-augmented-generation-rag",
    ],
    sectorTags: ["finance-and-insurance"],
    marketFormTags: ["software", "service"],
    localityTags: ["workplace", "other"],
  },

  // The 14 Annex IV answers, including the four the form marks optional.
  answers: {
    // Annex IV(1)(a): what changed in this version and why
    "q:annex-1:1a": "v1.2.0 follows v1.1.x. It recalibrates the scoring model on 2025 outcome data, adds the Dutch market, and moves the LLM explanation module from a single prompt to a retrieval-grounded one so explanations cite the applicable policy clause. The Approve/Review/Reject thresholds are unchanged from v1.1.3. v1.0.x is end-of-life; v1.1.3 remains supported until the next annual recalibration.",
    // 1(b): how it interacts with hardware and other software, optional
    "q:annex-1:1b": "MCAS is not used standalone. It ingests credit bureau records over the bureaux' own APIs, reads PSD2-authorised account data through the bank's aggregation layer, and returns scores and recommendations into the bank's core lending system over a documented REST interface. The LLM explanation module calls a hosted third-party model. The web portal, mobile app and staff dashboard that show the outputs belong to the deployer bank, not to the provider.",
    // 1(c): versions, and what it needs from its surroundings
    "q:annex-1:1c": "Deployed as the 1.2.x scoring service (Python 3.11, on-premise container) alongside the 0.9.x retrieval index for policy documentation. It requires the bank's aggregation layer at API version 3 or later. Patch releases may be applied by the bank within its own change window. Any recalibration of the model, any change to a decision threshold, and any change of the underlying LLM require re-validation and a fresh compliance sign-off before they are enabled in production.",
    // 1(d)+(e): the forms it is placed on the market in, and its hardware
    "q:annex-1:1de": "MCAS is put into service as a proprietary on-premise deployment inside each deployer bank's own data centre, with contractual audit access for the provider and the bank's regulator; there is no public download and no multi-tenant hosted form. Validated on x86-64 servers with 16 vCPU and 64 GB RAM; the gradient-boosted model runs on CPU, while the retrieval index requires 100 GB of local SSD. The third-party LLM is reached as an external API, so no GPU is required on the bank's premises.",
    // 1(f): a physical product it is built into, optional
    "q:annex-1:1f": "No physical product. MCAS is software: it runs as a set of containers on the deployer bank's own servers and reaches its users through the bank's web portal, mobile app and staff dashboard. There is nothing to photograph, no markings and no internal arrangement to describe, so no drawings are held.",
    // 1(g)+(h): what the deployer sees, and the instructions that ship with it
    "q:annex-1:1gh": "Loan officers and compliance staff use a case dashboard showing the 0-1000 score, the risk category, the recommendation, the influential factors, the generated explanation with its cited policy clause, and the full decision audit trail; it is also where an override is entered. Instructions for use ship as a versioned PDF plus an in-product help centre keyed to the running version, covering intended purpose, the supported loan range and markets, accuracy bounds, known limitations, the mandatory human review of every rejection and Review-bucket case, the written-justification requirement for overrides, and the escalation path to the bank's risk committee.",
    // Annex IV(2)(a): how it was developed, and what was reused
    "q:annex-2:2a": "The scoring model was built in-house: feature engineering on bureau, transaction and application data, then a gradient-boosted decision tree trained on the bank's historical loan outcomes. No pre-trained model is used for scoring. The explanation module wraps a hosted third-party LLM, used as-is with no fine-tuning, constrained by a retrieval index over the bank's own policy documentation and by a fixed system prompt held in version control. Policy rules (debt-to-income limits, age requirements, bankruptcy triggers) are hand-written and reviewed by compliance. Every stage has a named owner and a sign-off recorded in the design log.",
    // 2(b): the design logic, the assumptions, and the trade-offs accepted
    "q:annex-2:2b": "The model estimates probability of default over the loan term from bureau history, twelve months of aggregated transaction features, and application data; that probability is mapped to a 0-1000 score and then to Low/Medium/High and Approve/Review/Reject by fixed thresholds. It optimises for ranking quality (AUC) rather than raw accuracy, because the thresholds are set separately by the bank's risk appetite; the rationale is that a mis-ranked applicant is the real error, while the cut-off is a policy choice. Key assumptions: bureau coverage is complete for the deployment markets, twelve months of account history exist, and every rejection is reviewed by a human. The subjects are individual loan applicants, so protected attributes are excluded as direct features and monitored as fairness strata instead. Expected output is a score, a category, a recommendation, the influential factors, and a plain-language explanation citing a policy clause. The trade-off accepted for Chapter III Section 2 is the choice of a monotonic gradient-boosted tree over a higher-scoring unconstrained ensemble: it costs about 0.9 AUC points and buys per-factor explanations a loan officer can defend to an applicant.",
    // 2(c): the components and how they fit together
    "q:annex-2:2c": "Five components: an ingest and feature service that pulls bureau, PSD2 and application data and computes features; the scoring model; a policy-rule engine applying the hard eligibility rules; a retrieval-grounded explanation service that calls the external LLM; and a case and audit service backing the staff dashboard. The rule engine can veto an Approve recommendation but never creates one, so policy rules are always the tighter constraint. Components run as separate on-premise containers over an internal queue. Training and quarterly recalibration use a 32-vCPU CPU cluster, roughly 40 core-hours per run; no GPU is used on-premise, and validation runs on the same hardware as production.",
    // 2(d): the data it was trained on, optional
    "q:annex-2:2d": "Training used about 620,000 loan outcomes from the bank's last seven years (default/no-default labels), credit bureau records ingested under DPA-compliant contracts, twelve-month aggregated transaction features from PSD2-authorised access, and coarse demographic fields (age band, postal-code area). Provenance, licensing and consent basis are recorded per source in the data registry. Selection is stratified across the three deployment markets and across age bands, income deciles and postal-code clusters, with oversampling of historically under-represented postal areas. Labels come from the bank's own repayment records rather than manual annotation; the definition of default follows the regulatory 90-days-past-due rule. Cleaning removes duplicate applications, drops records with incomplete bureau coverage, winsorises transaction features at the 1st and 99th percentiles, and excludes the 2020-2021 payment-holiday period from the default definition to avoid encoding a policy artefact as credit risk.",
    // 2(e): the human oversight required by Article 14
    "q:annex-2:2e": "Article 14 oversight is structural: every rejection and every Review-bucket case goes to a trained loan officer before any binding decision reaches the applicant, and no adverse decision is ever issued on the model's output alone. Officers can approve, reject or override with a mandatory written justification recorded against the case, and can suspend automated scoring for a branch or market from the dashboard. The LLM chatbot is explicitly non-binding and refuses appeal advice; appeals are human-only. For Article 13(3), point (d), each case shows the score, the risk category, the influential factors with their direction and magnitude, the policy clause cited by the explanation, and a distribution plot placing the applicant against the recent population, so an officer can see how the recommendation arose and how confident it is. Because agreement with the model is the path of least resistance, the dashboard also tracks each officer's override rate against the branch median and flags officers who never diverge, and refresher training covers automation bias explicitly.",
    // 2(f): changes planned in advance, optional
    "q:annex-2:2f": "Two pre-determined changes are in scope. First, an annual recalibration of the scoring model on the most recent outcome data, on a fixed schedule with unchanged features and unchanged thresholds. Second, a quarterly refresh of the retrieval index when the bank's policy documentation changes. Both are covered by a written change procedure: the recalibrated model must clear the same validation suite and the same fairness acceptance bands as the release it replaces, the comparison is signed off by compliance before deployment, and the previous version stays deployable for rollback for one quarter. Changes to features, thresholds or the underlying LLM are explicitly outside the pre-determined set and require a full re-qualification.",
    // 2(g): validation, the metrics, and the discrimination testing
    "q:annex-2:2g": "Validation uses a temporally held-out set of the most recent 90,000 applications, so the model is always tested on outcomes later than anything it trained on, plus a per-market split for DE, FR and NL. Reported metrics are AUC and KS for ranking quality, calibration error by score decile, approval and default rates per threshold band, and stability of the score distribution against the production baseline. Robustness is tested by withholding each data source in turn, since bureau or PSD2 outages happen in production. Potentially discriminatory impact is measured quarterly as demographic parity and equal-opportunity difference across age band, gender via bureau proxy, and postal-code SES proxy, together with override rates by stratum to catch bias entering through human review; the last two audits showed no disparity above the 5% acceptance threshold in any deployed market. Test logs, the fairness audit and the dated, signed validation report are retained for 10 years in the release record.",
    // 2(h): cybersecurity
    "q:annex-2:2h": "The deployment is on-premise with no inbound internet exposure; bureau, PSD2 and LLM calls leave through an egress proxy with an allow-list. Applicant data is encrypted at rest and in transit, and the payload sent to the external LLM is restricted to the derived explanation factors, never raw applicant identifiers or account data. Container images are signed and verified at deploy; secrets live in the bank's vault. The dashboard enforces SSO with role separation between loan officer, compliance and administrator, and every read of an applicant case is written to an append-only audit log. Dependencies are pinned and scanned on each build with a documented patch window for critical CVEs; model artefacts are checksummed at load; and the prompt and retrieval index are version-controlled so an explanation can always be reproduced from the release record.",
  },

  // One full risk chain per row: source, vulnerability, consequence, control.
  risks: [
    {
      risk: "An applicant is wrongly ranked as high risk and routed to Reject",
      source: "Credit bureau coverage is incomplete or stale for that applicant, so the model scores them on thin data",
      vulnerability: "The features assume complete bureau history in every deployment market; there is no explicit low-coverage path",
      consequence: "A creditworthy applicant is refused a loan they would have repaid, and the recorded reason cites data that was never there",
      affected: "user",
      areas: ["right"],
      control: "Every Reject and every Review case goes to a trained loan officer before any decision reaches the applicant; bureau coverage below the configured threshold forces the case into Review",
      followUpControl: "The officer may override the recommendation with a mandatory written justification recorded against the case, and the applicant is told how to contest the outcome",
    },
    {
      risk: "Approval rates diverge across protected groups",
      source: "Postal-code and transaction features act as proxies for ethnicity and socio-economic status even though protected attributes are excluded as direct inputs",
      vulnerability: "",
      consequence: "Applicants from some neighbourhoods are systematically scored lower than equally creditworthy applicants elsewhere, which is discriminatory treatment",
      affected: "user",
      areas: ["right", "freedom"],
      control: "Quarterly fairness audit measuring demographic parity and equal-opportunity difference across age band, gender proxy and postal-code SES proxy, with a 5% acceptance band, plus override rates by stratum to catch bias entering through human review",
      followUpControl: "Suspend automated scoring for the affected market and fall back to manual underwriting until the next recalibration clears the band",
    },
    {
      risk: "Loan officers rubber-stamp the recommendation instead of reviewing it",
      source: "Automation bias: agreeing with the model is faster than justifying a divergence, and the queue is measured on throughput",
      vulnerability: "The dashboard presents the recommendation before the underlying factors, which anchors the officer on the model's answer",
      consequence: "The mandatory human review becomes a formality, so an incorrect score is issued as a binding decision with no effective safeguard",
      affected: "user",
      areas: ["right", "freedom"],
      control: "Officer override rates are tracked against the branch median, officers who never diverge are flagged for review, and refresher training covers automation bias explicitly",
      followUpControl: "Withdraw the officer's approval rights pending retraining and route their queue to a second reviewer",
    },
    {
      risk: "The explanation shown to an applicant cites the wrong policy clause",
      source: "The retrieval index over the bank's policy documentation falls out of date after a policy change",
      vulnerability: "The index refresh is a manual quarterly step with no staleness check at query time",
      consequence: "The applicant is given an inaccurate reason for the outcome, which undermines any attempt to contest it",
      affected: "user",
      areas: ["right"],
      control: "Quarterly index refresh signed off by compliance, and every explanation records the index version it was generated from so any answer can be reproduced",
      followUpControl: "",
    },
    {
      risk: "Training data is poisoned through the bureau ingestion path",
      source: "An attacker with access to a bureau feed injects records designed to shift the score distribution for a chosen segment",
      vulnerability: "Recalibration ingests bureau records without provenance signing, so a tampered batch is indistinguishable from a genuine one",
      consequence: "The recalibrated model systematically misranks a segment of applicants, and the drift is inside the normal seasonal range so monitoring does not catch it",
      affected: "operator",
      areas: ["safety", "right"],
      control: "Egress allow-list and mutually authenticated bureau connections, checksummed model artefacts verified at load, and recalibration gated on the same validation and fairness suites as a full release",
      followUpControl: "Roll back to the previous signed model, which stays deployable for one quarter, and notify the deployer banks and the market surveillance authority",
    },
  ],
};
