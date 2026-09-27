import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

import { projectDatabaseUrl } from "@/lib/projectDb";

// Qualification's step of the pipeline chain (scripts/test-pipeline-chain.sh, 03 WP12).
// Skipped unless CHAIN_JSON names the chain's shared state. Since the isolation (I19.2) the
// card lives in the chain project's own database: PROJECT_DATABASE_URL (a template with
// {database}, set by the driver) names it, and the driver has already migrated it. Step 2: the
// AI card of version 1 with two engine components linked by AIRO properties (a model and a
// dataset). It consumes the link from a card to its version: the card's foreign key into
// project.system of the same database (I1.6; the card names no project, I1.7).

const CHAIN_JSON = process.env.CHAIN_JSON ?? "";

describe.skipIf(!CHAIN_JSON)("pipeline chain", () => {
  it("chain_step2 card v1 with 2 card_component rows", async () => {
    const state = JSON.parse(readFileSync(CHAIN_JSON, "utf8"));
    const prisma = new PrismaClient({ datasources: { db: { url: projectDatabaseUrl(state.project_pid) } } });
    try {
      const fk = await prisma.$queryRawUnsafe<{ target: string }[]>(
        `SELECT confrelid::regclass::text AS target FROM pg_constraint
          WHERE contype = 'f' AND conrelid = 'qualification.qualification'::regclass
            AND confrelid = 'project.system'::regclass`,
      );
      expect(fk.map((r) => r.target), "the card's key into project.system").toEqual(["project.system"]);

      const card = await prisma.qualification.create({
        data: {
          systemId: state.v1_pid,
          systemName: "MCAS",
          systemVersion: "1.2.0",
          company: "LIST",
          description: "Scores microcredit loans",
          targetUseCase: "Credit decisions",
          targetUsers: "Loan officers",
          components: {
            create: [
              { componentPid: randomUUID(), airoProperty: "hasModel", name: "Scorer",
                componentType: "model", objectName: "models/scorer.pkl" },
              { componentPid: randomUUID(), airoProperty: "hasTestingData", name: "Holdout",
                componentType: "dataset", objectName: "datasets/holdout.csv" },
            ],
          },
        },
        include: { components: true },
      });
      expect(card.components).toHaveLength(2);

      const next = JSON.parse(readFileSync(CHAIN_JSON, "utf8"));
      next.card_v1_id = card.id;
      writeFileSync(CHAIN_JSON, JSON.stringify(next));
    } finally {
      await prisma.$disconnect();
    }
  }, 60_000);
});
