// Export one saved qualification as JSON for the ontology builder.
//
// Node owns the database (Prisma) and the form taxonomies; Python owns the
// ontology. This script is the seam: it resolves the taxonomy tags to their
// display labels and writes the shape airo_min.build.build_graph expects, so the
// Python side never parses the Prisma schema or the taxonomy files.
//
//   node scripts/export_qualification.mjs --name "MicroCredit" --out mcas.json
//   node scripts/export_qualification.mjs --id cmtv... > q.json
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import targetSystems from "../src/data/target_systems.json" with { type: "json" };
import sectors from "../src/data/sectors.json" with { type: "json" };

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1];
}

function resolveTargetSystem(tag) {
  const [categoryId, subId] = tag.split(":");
  const category = targetSystems.find((c) => c.id === categoryId);
  const sub = category?.items.find((s) => s.id === subId);
  if (!category || !sub) return null;
  return { tag, category: category.name, subcategory: sub.name };
}

function resolveSector(id) {
  const s = sectors.find((x) => x.id === id);
  return s ? { id: s.id, name: s.name } : null;
}

const prisma = new PrismaClient();

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
    include: { answers: true, risks: { orderBy: { position: "asc" } } },
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
    targetSystems: q.targetSystemTags.map(resolveTargetSystem).filter(Boolean),
    sectors: q.sectorTags.map(resolveSector).filter(Boolean),
    marketFormTags: q.marketFormTags,
    localityTags: q.localityTags,
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
      vulnerability: r.vulnerability,
      consequence: r.consequence,
      affected: r.affected,
      impactAreas: r.impactAreas,
      control: r.control,
      followUpControl: r.followUpControl,
    })),
  };

  const dropped =
    q.targetSystemTags.length -
    out.targetSystems.length +
    (q.sectorTags.length - out.sectors.length);
  if (dropped > 0) {
    console.error(
      `warning: ${dropped} tag(s) did not resolve against the taxonomy`,
    );
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
