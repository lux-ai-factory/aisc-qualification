// Export one saved qualification as JSON for the ontology builder.
//
// Node owns the database (Prisma); Python owns the ontology. This script is the
// seam: it writes the shape airo_min.build.build_graph expects, so the Python side
// never parses the Prisma schema. The structured fields are VAIR terms, which
// the builder names and types itself; a value that is not a
// term of its class is dropped with a warning, as QualificationExporter drops it.
//
// A card lives in its project's own database, so the project is named by its pid and the
// database is opened from PROJECT_DATABASE_URL.
//
//   node scripts/export_qualification.mjs --project <pid> --name "MicroCredit" --out mcas.json
//   node scripts/export_qualification.mjs --project <pid> --id cmtv... > q.json
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

import { PROJECT_ID, projectDatabaseUrl } from "./projectDb.mjs";
import vair from "../src/data/vair_vocab.json" with { type: "json" };

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1];
}

let dropped = 0;
function terms(cls, ids) {
  const known = new Set(vair.classes[cls].map((t) => t.id));
  const kept = ids.filter((id) => known.has(id));
  dropped += ids.length - kept.length;
  return kept;
}

const project = arg("--project") ?? "";
if (!PROJECT_ID.test(project)) {
  console.error("pass --project <pid>: the card is read from that project's own database");
  process.exit(2);
}
const prisma = new PrismaClient({
  datasourceUrl: projectDatabaseUrl(project, process.env.PROJECT_DATABASE_URL ?? ""),
});

async function main() {
  const id = arg("--id");
  const name = arg("--name");
  if (!id && !name) {
    throw new Error(
      "pass --id <cuid> or --name <substring of the system name>",
    );
  }

  const q = await prisma.qualification.findFirst({
    where: id ? { id } : { systemName: { contains: name } },
    include: {
      answers: true,
      risks: { orderBy: { position: "asc" } },
      systemComponents: { orderBy: { position: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!q) throw new Error(`no qualification matched ${id ?? name}`);

  const out = {
    id: q.id,
    systemName: q.systemName,
    systemVersion: q.systemVersion,
    company: q.company,
    description: q.description,
    targetUseCase: q.targetUseCase,
    targetUsers: q.targetUsers,
    intendedDeployers: q.intendedDeployers,
    systemType: q.systemType,
    purpose: q.purpose,
    targetSystemTags: terms("AICapability", q.targetSystemTags),
    sectorTags: terms("Domain", q.sectorTags),
    marketFormTags: terms("Modality", q.marketFormTags),
    localityTags: terms("LocalityOfUse", q.localityTags),
    answers: q.answers
      .map((a) => ({
        toolId: a.toolId,
        questionId: a.questionId,
        answer: a.answer,
      }))
      .sort((a, b) => a.questionId.localeCompare(b.questionId)),
    risks: q.risks.map((r) => ({
      position: r.position,
      risk: r.risk,
      source: r.source,
      sourceTerm: r.sourceTerm,
      vulnerability: r.vulnerability,
      consequence: r.consequence,
      consequenceTerm: r.consequenceTerm,
      impactTerm: r.impactTerm,
      affected: r.affected,
      impactAreas: r.impactAreas,
      control: r.control,
      controlTerm: r.controlTerm,
      followUpControl: r.followUpControl,
      followUpControlTerm: r.followUpControlTerm,
    })),
    ...(q.systemComponents.length
      ? {
          systemComponents: q.systemComponents.map((c) => ({
            key: c.key,
            name: c.name,
            role: c.role,
            kind: c.kind,
            vairType: c.vairType,
            provider: c.provider,
            providerName: c.providerName,
          })),
        }
      : {}),
  };

  if (dropped > 0) {
    console.error(`warning: ${dropped} tag(s) are not VAIR terms of their class and were dropped`);
  }

  const json = JSON.stringify(out, null, 2);
  const dest = arg("--out");
  if (dest) {
    writeFileSync(dest, json + "\n");
    console.error(
      `${out.systemName}: ${out.answers.length} answers, ${out.risks.length} risks -> ${dest}`,
    );
  } else {
    process.stdout.write(json + "\n");
  }
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
