import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const QUALIFICATION = {
  systemName: "MicroCredit Assist Score (MCAS)",
  systemVersion: "v1.2.0",
  company: "Creditum AI SARL (Luxembourg)",
  description:
    "Credit scoring system that evaluates creditworthiness for short-term consumer loans (€100–€5,000). It combines a gradient-boosted decision tree on applicant data with an LLM chatbot that produces natural-language explanations and answers customer questions from policy documentation. Licensing: proprietary, on-premise with audit access. Documentation: https://docs.microcreditassist.ai (public technical docs, API specs, deployment guides).",
  targetUseCase:
    "Retail banking and consumer micro-finance in the EU (deployed in Germany, France, and the Netherlands). Evaluates creditworthiness for €100–€5,000 consumer loans, returns a 0–1000 credit score, a Low/Medium/High risk category, and an Approve/Review/Reject recommendation, alongside influential factors and a natural-language explanation surfaced via the bank's web portal, mobile app, and staff dashboard. The subjects of the system are individual loan applicants whose access to credit is affected by its outputs.",
  targetUsers:
    "Primary: bank customers aged 18+ applying for consumer loans through the bank's web portal or mobile app. Secondary: bank loan officers and compliance staff who monitor decisions, conduct manual reviews of borderline cases, and can approve, reject, or override outcomes with mandatory written justification.",
  targetSystemTags: [
    "tabular-structured-data:tabular-classification-regression",
    "predictive-analytical-ai:risk-scoring-assessment",
    "predictive-analytical-ai:predictive-analytics",
    "natural-language-processing:text-generation-summarization",
    "natural-language-processing:question-answering",
    "knowledge-retrieval:retrieval-augmented-generation-rag",
  ],
  sectorTags: ["finance-and-insurance"],
};

const ANSWERS = {
  "article-10-data-governance": {
    "data-source-q01":
      "Training data combines (a) the bank's historical loan-outcome dataset (default/no-default labels over the last 7 years, ~620K records), (b) credit bureau records ingested under DPA-compliant contracts (payment history, existing debts, defaults), (c) 12-month aggregated bank transaction features derived from PSD2-authorised account access, and (d) demographic fields (age band, postal-code area). Lineage, licensing, and consent basis are tracked per source in the data registry.",
    "sufficiently-representative-q07":
      "The dataset is stratified across the three deployment markets (DE, FR, NL) and across age bands, income deciles, and postal-code clusters, with explicit oversampling of historically under-represented postal areas. A fairness audit is run quarterly comparing approval, default, and override rates across protected groups (age band, gender via bureau proxy, postal-code SES proxy); the last two audits flagged no statistically significant disparity above the 5% threshold for the deployed regions.",
  },
  "article-12-logging": {
    "governance-design-stage-q01":
      "Design-stage governance is documented in a versioned design log (Git-backed Markdown plus Confluence). Each decision — model choice, threshold setting, policy rule (debt-to-income limits, age requirements, bankruptcy triggers), and AI Act risk-class assignment — links to a named owner, the date, and the underlying evidence. Sign-off requires the model owner, the compliance officer, and a representative of the bank deployer.",
    "development-stage-q03":
      "Every training, evaluation, and re-calibration run logs hyperparameters, dataset hashes, fairness/accuracy metrics, and model artifacts to an internal MLflow instance. Runs are immutable and retained for 10 years to match retail-banking record-keeping obligations. Each model release is tied to a git tag, a signed model card, and the corresponding regulatory impact assessment.",
  },
  "article-13-transparency": {
    "system-description-and-intended-purpose-q05":
      "Intended purpose: pre-screening and decision support for €100–€5,000 consumer-loan applications in DE/FR/NL retail-banking workflows. Outputs are a 0–1000 score, a Low/Medium/High risk category, and an Approve/Review/Reject recommendation, plus explanations and chatbot responses. The system must not be used outside that loan range, for non-consumer credit, or as the sole basis for rejection without a documented human review. Out-of-scope use is gated contractually and by technical input validation in the data ingestion pipeline.",
    "instructions-for-use-ifu-q01":
      "Deployer banks receive a versioned IFU bundle: (i) a printable PDF describing intended use, supported markets, accuracy bounds, known limitations, and required oversight; (ii) an in-product help centre that mirrors the PDF and is keyed to the running model version; (iii) an explicit operator checklist for handling the Review queue, including escalation triggers and the mandatory-justification step before any staff override. Customer-facing copy in the web portal and mobile app reuses the LLM explanation module so applicants receive plain-language reasons for the outcome.",
  },
  "article-14-human-oversight": {
    "human-oversight-measures-for-risk-mitigation-q07":
      "All rejections and all Review-bucket cases are routed to a trained loan officer before any binding decision is communicated to the applicant. Approvals at or below the configured high-confidence threshold are auto-issued; any decision involving an override of the model output requires a written justification recorded against the case. The LLM chatbot is non-binding and explicitly disclaims advice on appeals — appeal handling is human-only.",
    "deployer-implemented-oversight-measures-q11":
      "Deployer banks operate a daily monitoring dashboard that tracks approval, rejection, and override rates by branch and demographic stratum, model drift on the score distribution, and chatbot disagreement/escalation rates. A standing oversight committee (model owner, compliance, customer-experience lead) meets monthly with documented escalation paths to the bank's risk committee and to Creditum AI's support team for model-level issues.",
  },
};

function buildAnswers() {
  const list = [];
  for (const [toolId, qs] of Object.entries(ANSWERS)) {
    for (const [questionId, answer] of Object.entries(qs)) {
      list.push({ toolId, questionId, answer });
    }
  }
  return list;
}

async function main() {
  console.log("Seeding MCAS qualification");

  const created = await prisma.qualification.create({
    data: {
      systemName: QUALIFICATION.systemName,
      systemVersion: QUALIFICATION.systemVersion,
      company: QUALIFICATION.company,
      description: QUALIFICATION.description,
      targetUseCase: QUALIFICATION.targetUseCase,
      targetUsers: QUALIFICATION.targetUsers,
      targetSystemTags: QUALIFICATION.targetSystemTags,
      sectorTags: QUALIFICATION.sectorTags,
      answers: { create: buildAnswers() },
    },
    select: { id: true, systemName: true },
  });
  console.log(`  + ${created.systemName} (${created.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
