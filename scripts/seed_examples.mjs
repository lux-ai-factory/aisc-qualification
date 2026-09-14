import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Answers keyed by Annex IV point (toolId) and sub-item id (questionId), matching
// src/data/keyQuestions.ts. Annex IV(1)(f) and (2)(f) are left out on purpose:
// both are "where applicable" sub-items and this example system is neither a
// product component nor subject to pre-determined changes.
const KEY_ANSWERS = {
  "annex-1": {
    "1a": "Version 2.4.0 succeeds 2.3.x. It replaces the detection backbone with a re-trained model, raises the default confidence threshold from 0.72 to 0.80 after a false-positive review, and adds a per-store calibration step. 2.3.x remains supported for six months; earlier versions are end-of-life.",
    "1b": "The system consumes RTSP streams from in-store IP cameras it does not control, and pushes alerts to the deployer's existing task-management system over a documented REST webhook. It also calls a third-party LLM API to phrase alert text. None of those components are part of the system, and each integration point is version-pinned and documented in the integration guide.",
    "1c": "Runtime requires the 2.4.x inference container (CUDA 12.4, Python 3.11), camera firmware 5.1 or later for the H.265 profile, and the 1.3.x edge agent. Minor updates are delivered as signed container images and may be applied by the deployer; any change to the model or the threshold configuration is a major update and requires re-validation against the deployer's acceptance set before it is enabled.",
    "1de":
      "The system is placed on the market in two forms: a self-hosted container bundle for on-premise deployment, and a hosted API for deployers without local GPU capacity. Neither form is embedded into hardware sold by the provider. On-premise deployment is validated on an x86-64 server with 32 GB RAM and one NVIDIA L4 GPU; the hosted form runs on equivalent managed instances. CPU-only operation is supported but not validated for real-time use.",
    "1gh":
      "Deployers get a web console showing live alerts, per-camera health, the confidence threshold, and an audit log of every alert and acknowledgement. Instructions for use ship as a versioned PDF plus an in-console help centre keyed to the running version, covering intended purpose, the validated hardware envelope, accuracy bounds per lighting condition, known limitations, the required human acknowledgement step, and the escalation path when alert volume exceeds the configured ceiling.",
  },
  "annex-2": {
    "2a": "Development started from a publicly available pre-trained detection backbone, which was fine-tuned on the provider's own labelled shelf imagery; the pre-trained weights were used under their original licence and are recorded in the model registry. The alert-phrasing step calls a third-party LLM API and was not trained by the provider. Remaining components (calibration, tracking, the alerting rules) were built in-house. Each stage has an owner, a design record and a sign-off in the versioned design log.",
    "2b": "The pipeline detects product facings per shelf region, compares the count against the expected planogram, and raises an alert when a tracked SKU stays below its replenishment threshold across three consecutive frames. It optimises recall of genuine out-of-stock events at a fixed false-positive budget, on the rationale that a missed gap costs more than an unnecessary check. Key assumptions: fixed camera geometry per store, a current planogram, and staff who can verify an alert on the shelf within minutes. The intended subjects are shelf states, not people; faces are blurred at ingest and no person-level inference is performed. Expected output is an alert with a confidence value and a cropped region; the trade-off accepted for Chapter III Section 2 is the higher threshold, which reduces alert volume and improves precision at a measured cost in recall for narrow-facing SKUs.",
    "2c": "Four components in sequence: an ingest service that decodes streams and blurs faces; the detection model; a calibration and tracking layer holding per-store geometry and temporal state; and an alerting service that applies planogram rules and writes the audit log. Each is a separate container communicating over an internal queue, so any one can be replaced without touching the others. Development and training used a 4x A100 cluster for roughly 900 GPU-hours across the release; validation runs on a single L4, matching the deployment envelope.",
    "2d": "Training used about 480,000 labelled shelf images collected 2022-2025 under DPA-compliant agreements with participating retailers, plus a filtered subset of a public image corpus for background variety. Provenance, licence and consent basis are recorded per source in the data registry. Selection was stratified across store formats, EU regions, shelf types and lighting conditions, with deliberate oversampling of low-light and reflective-packaging cases. Labelling was performed by a contracted annotation team against a written facing-definition guideline, with 10% double-annotation and a Cohen's kappa gate of 0.85. Cleaning removed duplicates by perceptual hash, dropped frames where the blur step failed, and excluded images whose planogram reference could not be established.",
    "2e": "Article 14 oversight rests on a human acknowledgement step: an alert is a prompt to check a shelf, never an automated action, and the console requires a member of staff to confirm or dismiss it. Operators can lower the threshold, mute a camera, or stop the system per store from the console without provider involvement. To support Article 13(3), point (d), every alert carries its confidence value, the cropped image region it was raised from, and the planogram rule that fired, so the operator can see why it triggered; a per-camera reliability panel shows recent precision so staff can judge how much weight to give a given feed.",
    "2g": "Validation used a held-out set of 62,000 images from 40 stores not present in training, stratified by lighting and shelf type, plus a two-week live shadow deployment in four stores. Reported metrics are precision, recall and F1 for out-of-stock detection overall and per stratum, latency at the 95th percentile, and robustness under injected blur, occlusion and camera-shift perturbations. Discriminatory impact is assessed by comparing per-stratum recall across store formats and neighbourhood income bands, to check that alert quality does not degrade for stores serving lower-income areas; the last run showed a 2.1-point recall spread, inside the 5-point acceptance band. Test logs and the dated, signed validation report are held in the release record for each version.",
    "2h": "Streams are terminated over TLS with per-camera credentials; the container images are signed and verified at deploy time; secrets are held in the deployer's vault and never in the image. The console enforces SSO with role separation between operator and administrator, and writes an append-only audit log. Third-party dependencies are pinned and scanned on every build, with a documented patch window for critical CVEs. The model artefacts are checksummed at load to detect tampering, and the ingest service validates stream metadata to reject malformed or replayed input.",
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
    overview: `${q.systemName} is a ${targetSystems[0].subcategory.toLowerCase()} system operated by ${q.company}. It supports ${sectors.join(", ").toLowerCase()} workflows and is documented against EU AI Act Annex IV points 1 and 2. Versioning, integration surface, development method, data governance, human oversight, validation and cybersecurity are all described; open issues are tracked below.`,
    findings: [
      {
        title: "Annex IV(1)(a) — Version lineage",
        summary:
          "Version 2.4.0 succeeds 2.3.x with a re-trained detection backbone, a confidence threshold raised from 0.72 to 0.80, and a new per-store calibration step.",
        points: [
          "Threshold raise followed a documented false-positive review",
          "2.3.x supported for six months; earlier versions end-of-life",
        ],
      },
      {
        title: "Annex IV(1)(b) — External hardware and software",
        summary:
          "The system depends on components it does not control: in-store IP cameras over RTSP, the deployer's task-management system over a REST webhook, and a third-party LLM API for alert phrasing.",
        points: [
          "Every integration point is version-pinned and documented",
          "None of the three components form part of the system itself",
        ],
      },
      {
        title: "Annex IV(1)(c) — Software versions and update requirements",
        summary:
          "Runtime requires the 2.4.x inference container on CUDA 12.4, camera firmware 5.1 or later, and the 1.3.x edge agent.",
        points: [
          "Minor updates ship as signed images and may be applied by the deployer",
          "Model or threshold changes are major updates and require re-validation against the deployer's acceptance set",
        ],
      },
      {
        title: "Annex IV(1)(d)-(e) — Delivery forms and target hardware",
        summary:
          "Placed on the market as a self-hosted container bundle and as a hosted API; validated on x86-64 with 32 GB RAM and one NVIDIA L4.",
        points: [
          "Not embedded into any hardware sold by the provider",
          "CPU-only operation is supported but not validated for real-time use",
        ],
      },
      {
        title:
          "Annex IV(1)(g)-(h) — Deployer interface and instructions for use",
        summary:
          "A web console exposes live alerts, camera health, the confidence threshold and a full audit log; instructions for use ship as a versioned PDF plus an in-console help centre keyed to the running version.",
        points: [
          "Covers intended purpose, validated hardware envelope and per-lighting accuracy bounds",
          "Documents the required human acknowledgement step and the alert-volume escalation path",
        ],
      },
      {
        title: "Annex IV(2)(a) — Development method and third-party components",
        summary:
          "A publicly available pre-trained detection backbone was fine-tuned on the provider's own labelled shelf imagery; calibration, tracking and alerting were built in-house, and alert phrasing calls an external LLM the provider did not train.",
        points: [
          "Pre-trained weights used under their original licence and recorded in the model registry",
          "Each stage carries an owner, a design record and a sign-off",
        ],
      },
      {
        title: "Annex IV(2)(b) — Design specifications and trade-offs",
        summary:
          "The system counts product facings per shelf region against the planogram and alerts when a tracked SKU stays below its replenishment threshold across three consecutive frames, optimising recall of genuine out-of-stock events at a fixed false-positive budget.",
        points: [
          "Assumes fixed camera geometry, a current planogram, and staff able to verify within minutes",
          "Subjects are shelf states, not people: faces are blurred at ingest and no person-level inference is performed",
          "Accepted trade-off: the higher threshold improves precision at a measured recall cost for narrow-facing SKUs",
        ],
      },
      {
        title: "Annex IV(2)(c) — Architecture and computational resources",
        summary:
          "Four containerised components in sequence (ingest and blur, detection, calibration and tracking, alerting and audit) communicating over an internal queue, so any one can be replaced independently.",
        points: [
          "Training used roughly 900 GPU-hours on 4x A100 across the release",
          "Validation runs on a single L4, matching the deployment envelope",
        ],
      },
      {
        title: "Annex IV(2)(d) — Training data and labelling",
        summary:
          "About 480,000 labelled shelf images collected 2022-2025 under DPA-compliant retailer agreements, plus a filtered public corpus for background variety, stratified across store formats, regions, shelf types and lighting.",
        points: [
          "Provenance, licence and consent basis recorded per source in the data registry",
          "10% double-annotation against a written facing-definition guideline, gated at Cohen's kappa 0.85",
          "Cleaning removed perceptual-hash duplicates and frames where the blur step failed",
        ],
      },
      {
        title: "Annex IV(2)(e) — Human oversight measures",
        summary:
          "An alert is a prompt to check a shelf, never an automated action: the console requires staff to confirm or dismiss each one, and operators can lower the threshold, mute a camera or stop the system per store.",
        points: [
          "Every alert carries its confidence value, the cropped region and the planogram rule that fired",
          "A per-camera reliability panel shows recent precision so staff can weight a feed appropriately",
        ],
      },
      {
        title: "Annex IV(2)(g) — Validation, testing and discriminatory impact",
        summary:
          "Validated on 62,000 held-out images from 40 unseen stores plus a two-week live shadow deployment, reporting precision, recall and F1 overall and per stratum, p95 latency, and robustness under injected blur, occlusion and camera shift.",
        points: [
          "Per-stratum recall compared across store formats and neighbourhood income bands",
          "Last run showed a 2.1-point recall spread, inside the 5-point acceptance band",
          "Test logs and the dated, signed validation report are held in each release record",
        ],
      },
      {
        title: "Annex IV(2)(h) — Cybersecurity measures",
        summary:
          "TLS-terminated streams with per-camera credentials, signed container images verified at deploy, secrets held in the deployer's vault, and SSO with operator/administrator role separation over an append-only audit log.",
        points: [
          "Dependencies pinned and scanned per build, with a documented critical-CVE patch window",
          "Model artefacts checksummed at load; ingest rejects malformed or replayed stream metadata",
        ],
      },
    ],
    open_issues: [
      "Annex IV(1)(f) and (2)(f) are unanswered, but both are marked 'where applicable' and neither appears to apply: the system is not a component of a physical product and no pre-determined changes are declared.",
      "Bias audit cadence to be tightened from quarterly to monthly during the next release cycle.",
      "External red-team exercise for adversarial inputs is scheduled but not yet executed.",
    ],
    generated_at:
      new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
    qualification_id: q.id,
  };
}

// Question 15 rows for the example systems: one full AIRO risk chain each.
const RISKS = [
  {
    position: 0,
    risk: "An out-of-stock alert is raised for a shelf that is full",
    source: "Poor lighting, reflective packaging or a moved camera",
    vulnerability:
      "The detector was not trained on low-light images for every store format",
    consequence: "Staff are sent to check a shelf that needs nothing",
    affected: "user",
    impactAreas: ["safety"],
    control:
      "Confidence threshold at 0.80 and human acknowledgement before any action",
    followUpControl:
      "Mute the camera from the console and fall back to manual checks",
  },
  {
    position: 1,
    risk: "A genuine gap is missed for a narrow-facing product",
    source: "The higher confidence threshold trades recall for precision",
    vulnerability: null,
    consequence: "The product stays out of stock longer than it should",
    affected: "user",
    impactAreas: ["safety"],
    control: "Per-store calibration and weekly recall review per stratum",
    followUpControl: null,
  },
];

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
    intendedDeployers:
      "Supermarket chains running the cameras in their own stores.",
    marketFormTags: ["software", "service"],
    localityTags: ["workplace", "publicly-accessible-space"],
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
    intendedDeployers:
      "Retail banks using the score inside their lending workflow.",
    marketFormTags: ["software"],
    localityTags: ["workplace"],
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
        intendedDeployers: ex.intendedDeployers,
        marketFormTags: ex.marketFormTags,
        localityTags: ex.localityTags,
        answers: { create: answers },
        risks: { create: RISKS },
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
      console.log(`    ↳ AI card pre-generated`);
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
