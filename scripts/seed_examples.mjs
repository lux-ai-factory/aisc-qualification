import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const KEY_ANSWERS = {
  "article-10-data-governance": {
    "data-source-q01":
      "Training data combines a proprietary internal dataset (~480K labeled samples collected 2022-2025 under DPA-compliant agreements) with two public corpora (Open Images v6, Common Crawl filtered subset). Lineage and licenses tracked in the data registry.",
    "sufficiently-representative-q07":
      "Stratified sampling across geographies (EU-27, with explicit oversampling of underrepresented countries) and demographic axes. A bias audit was run quarterly; the last two reports flagged no statistically significant under-representation above the 5% threshold.",
  },
  "article-12-logging": {
    "governance-design-stage-q01":
      "Design decisions, dataset choices, and risk assessments are tracked in a versioned design log (Notion + git-backed Markdown). Each decision links to the responsible owner and the AI Act risk class assignment.",
    "development-stage-q03":
      "Every training run logs hyperparameters, data hashes, eval metrics, and model artifacts to MLflow. Runs are immutable and retained for 5 years.",
  },
  "article-13-transparency": {
    "system-description-and-intended-purpose-q01":
      "The system is designed for a narrow, well-defined use case described in the model card and the contract with the deployer. Out-of-scope use is gated by an EULA + technical guardrails (rate limit, allow-list of inputs).",
    "instructions-for-use-ifu-q01":
      "Deployers receive a printable IFU PDF + a versioned in-product help center. The IFU covers intended use, known limitations, accuracy bounds, oversight requirements, and the human-in-the-loop checklist.",
  },
  "article-14-human-oversight": {
    "human-oversight-measures-for-risk-mitigation-q07":
      "All high-impact outputs require explicit human confirmation before they take effect. Confidence below 0.85 routes to a 4-eyes review queue staffed by trained operators with the authority to override.",
    "deployer-implemented-oversight-measures-q11":
      "Deployers run a daily monitoring dashboard with override rate, disagreement rate, and drift metrics. A standing oversight committee meets weekly and has documented escalation paths.",
  },
};

function buildAnswers() {
  const list = [];
  for (const [toolId, qs] of Object.entries(KEY_ANSWERS)) {
    for (const [questionId, answer] of Object.entries(qs)) {
      list.push({ toolId, questionId, answer });
    }
  }
  return list;
}

function buildSystemCard(q, targetSystems, sectors) {
  return {
    system_name: q.systemName,
    system_version: q.systemVersion,
    provider: q.company,
    description: q.description,
    target_use_case: q.targetUseCase,
    target_users: q.targetUsers,
    classification: { target_systems: targetSystems, sectors },
    overview: `${q.systemName} is a ${targetSystems[0].subcategory.toLowerCase()} system operated by ${q.company}. It supports ${sectors.join(", ").toLowerCase()} workflows and is covered by AI Act Articles 10, 12, 13, and 14. Documentation, oversight, and data governance controls are in place; open issues are tracked below.`,
    findings: [
      {
        article: "Article 10",
        title: "Data & Data Governance",
        summary:
          "Training data combines internal labeled samples with vetted public sources. Lineage and licenses are tracked, and bias audits are run quarterly with no significant under-representation flagged in the latest two reports.",
        points: [
          "Mixed proprietary + public corpora with explicit license tracking",
          "Quarterly bias audit, last two clean",
          "Stratified sampling across EU-27 with oversampling of underrepresented populations",
        ],
        references: ["Article 10.2.b", "Article 10.3"],
      },
      {
        article: "Article 12",
        title: "Documentation & Logging",
        summary:
          "Design decisions and training runs are logged to immutable systems with 5-year retention. Each decision links back to an owner and an AI Act risk class assignment.",
        points: [
          "Versioned design log links every decision to an owner",
          "MLflow captures runs, hyperparameters, data hashes",
          "5-year retention policy enforced",
        ],
        references: ["Article 12.1", "Article 12.2.a"],
      },
      {
        article: "Article 13",
        title: "Transparency",
        summary:
          "The system has a tightly scoped intended purpose. Deployers receive a printable IFU plus a versioned in-product help center covering accuracy bounds, limitations, and the oversight checklist.",
        points: [
          "Narrow, contractually defined intended purpose",
          "Out-of-scope use technically gated",
          "Versioned IFU shipped with every release",
        ],
        references: ["Article 13.1", "Article 13.3.b"],
      },
      {
        article: "Article 14",
        title: "Human Oversight",
        summary:
          "All high-impact outputs require explicit human confirmation. A 4-eyes review queue handles low-confidence cases, and a standing oversight committee meets weekly with documented escalation.",
        points: [
          "Confidence < 0.85 routes to 4-eyes review",
          "Daily monitoring dashboard tracks override and disagreement rates",
          "Weekly oversight committee with escalation paths",
        ],
        references: ["Article 14.4", "Article 14.5"],
      },
    ],
    open_issues: [
      "Bias audit cadence to be tightened from quarterly to monthly during the next release cycle.",
      "External red-team exercise for adversarial inputs is scheduled but not yet executed.",
    ],
    generated_at:
      new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
    qualification_id: q.id,
  };
}

const EXAMPLES = [
  {
    systemName: "ShelfScan Vision",
    systemVersion: "2.4.0",
    company: "Acme Retail Technologies",
    description:
      "Computer vision system that detects out-of-stock items on retail shelves from in-store camera footage.",
    targetUseCase:
      "Real-time alerts to store associates when high-velocity SKUs fall below the replenishment threshold.",
    targetUsers:
      "Store associates and shelf-replenishment staff in supermarkets across the EU.",
    targetSystemTags: [
      "computer-vision:object-detection-segmentation",
      "computer-vision:image-understanding-classification",
    ],
    sectorTags: ["trade", "industry-entrepreneurship"],
    targetSystemsLabels: [
      {
        category: "Computer Vision",
        subcategory: "Object Detection / Segmentation",
      },
      {
        category: "Computer Vision",
        subcategory: "Image Understanding / Classification",
      },
    ],
    sectorsLabels: ["Trade", "Industry & Entrepreneurship"],
    withCard: true,
  },
  {
    systemName: "MedSummarizer",
    systemVersion: "0.9.1-beta",
    company: "Helix Health AI",
    description:
      "Clinical LLM that condenses multi-document patient histories into a 1-page handover note for receiving clinicians.",
    targetUseCase:
      "Shift handover and inter-hospital transfers in EU public hospitals; never used as a sole diagnostic source.",
    targetUsers:
      "Hospital physicians and nurses signing off on patient handovers.",
    targetSystemTags: [
      "natural-language-processing:text-understanding-classification",
      "knowledge-retrieval:retrieval-augmented-generation-rag",
    ],
    sectorTags: ["health", "public-sector"],
    targetSystemsLabels: [
      {
        category: "Natural Language Processing",
        subcategory: "Text Understanding / Classification",
      },
      {
        category: "Knowledge Retrieval",
        subcategory: "Retrieval-Augmented Generation (RAG)",
      },
    ],
    sectorsLabels: ["Health", "Public sector"],
    withCard: true,
  },
  {
    systemName: "CredCheck Score",
    systemVersion: "5.2.0",
    company: "Northwind Lending Services",
    description:
      "Credit scoring system that estimates default probability for short-term consumer loans using tabular applicant data.",
    targetUseCase:
      "Pre-screening of online consumer-loan applications (€500–€5000) prior to a manual underwriter review.",
    targetUsers:
      "Underwriting analysts and the customer-experience team handling appeals.",
    targetSystemTags: [
      "tabular-structured-data:tabular-classification-regression",
      "predictive-analytical-ai:predictive-analytics",
    ],
    sectorTags: ["finance-and-insurance"],
    targetSystemsLabels: [
      {
        category: "Tabular / Structured Data",
        subcategory: "Tabular Classification / Regression",
      },
      {
        category: "Predictive / Analytical AI",
        subcategory: "Predictive Analytics",
      },
    ],
    sectorsLabels: ["Finance and insurance"],
    withCard: false,
  },
];

async function main() {
  console.log("Seeding examples");

  const answers = buildAnswers();

  for (const ex of EXAMPLES) {
    const created = await prisma.qualification.create({
      data: {
        systemName: ex.systemName,
        systemVersion: ex.systemVersion,
        company: ex.company,
        description: ex.description,
        targetUseCase: ex.targetUseCase,
        targetUsers: ex.targetUsers,
        targetSystemTags: ex.targetSystemTags,
        sectorTags: ex.sectorTags,
        answers: { create: answers },
      },
      select: { id: true, systemName: true },
    });
    console.log(`  + ${created.systemName} (${created.id})`);

    if (ex.withCard) {
      const card = buildSystemCard(
        { ...ex, id: created.id },
        ex.targetSystemsLabels,
        ex.sectorsLabels,
      );
      await prisma.qualification.update({
        where: { id: created.id },
        data: { systemCardJson: card, systemCardAt: new Date() },
      });
      console.log(`    ↳ system card pre-generated`);
    }
  }
  console.log("done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
