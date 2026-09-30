import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { MCAS } from "@/data/examples/mcas";
import { seedMcas } from "../../scripts/seed_mcas.mjs";

// Addendum 06, R72: the worked MCAS example answers the same questions, 1(f)
// included and with the same text, in all three places it lives: the ontology
// fixture services/ontology/examples/mcas.qualification.json, the form's
// example src/data/examples/mcas.ts, and the seed scripts/seed_mcas.mjs. The
// seed's answers are read through the module: seedMcas() is run against a fake
// prisma and a given platform answer, so nothing is changed in the script.

const JSON_FILE = "services/ontology/examples/mcas.qualification.json";
type Answer = { toolId: string; questionId: string; answer: string };

const fromJson = (): Answer[] => JSON.parse(readFileSync(JSON_FILE, "utf8")).answers;

const fromExample = (): Answer[] =>
  Object.entries(MCAS.answers as Record<string, string>)
    .filter(([field]) => field.startsWith("q:"))
    .map(([field, answer]) => {
      const [, toolId, questionId] = field.split(":");
      return { toolId, questionId, answer };
    });

async function fromSeed(): Promise<Answer[]> {
  const create = vi.fn(async (args: { data: { answers: { create: Answer[] } } }) => ({ id: "x", systemName: "MCAS", args }));
  const prisma = { qualification: { findUnique: vi.fn(async () => null), create, delete: vi.fn() } };
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await seedMcas(prisma as never, { platform: { projectId: "p", systemId: "s" } } as never);
  } finally {
    log.mockRestore();
  }
  return create.mock.calls[0][0].data.answers.create;
}

const keys = (a: Answer[]) => a.map((x) => `${x.toolId}:${x.questionId}`).sort();
const ONE_F = (a: Answer[]) => a.find((x) => x.questionId === "1f")?.answer;

describe("the MCAS example agrees everywhere (R72)", () => {
  it("R72 the ontology JSON answers the same 14 questions as mcas.ts", () => {
    expect(keys(fromJson())).toEqual(keys(fromExample()));
    expect(fromJson()).toHaveLength(14);
  });

  it("R72 the ontology JSON answers the same questions as the seed", async () => {
    expect(keys(fromJson())).toEqual(keys(await fromSeed()));
  });

  it("R72 the 1(f) text is the same in all three", async () => {
    const text = ONE_F(fromExample());
    expect(text).toBeTruthy();
    expect(ONE_F(fromJson())).toBe(text);
    expect(ONE_F(await fromSeed())).toBe(text);
  });

  it("R72 the JSON's answers follow KEY_QUESTIONS order, with 1f right after 1de", () => {
    const ids = fromJson().map((a) => a.questionId);
    expect(ids).toEqual(["1a", "1b", "1c", "1de", "1f", "1gh", "2a", "2b", "2c", "2d", "2e", "2f", "2g", "2h"]);
  });

  it("R72 the ontology README's example table says 14 Annex IV answers and 413 triples", () => {
    const readme = readFileSync("services/ontology/README.md", "utf8");
    expect(readme).toContain("14 Annex IV answers");
    expect(readme).toContain("413 triples");
    expect(readme).not.toContain("13 Annex IV answers");
    expect(readme).not.toContain("295 triples");
  });
});

// 2026-09-30: the form speaks VAIR, and the three copies carry the same terms.
async function seedData(): Promise<Record<string, unknown> & { risks: { create: Record<string, unknown>[] } }> {
  const create = vi.fn(async (args: { data: unknown }) => ({ id: "x", systemName: "MCAS", args }));
  const prisma = { qualification: { findUnique: vi.fn(async () => null), create, delete: vi.fn() } };
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await seedMcas(prisma as never, { platform: { projectId: "p", systemId: "s" } } as never);
  } finally {
    log.mockRestore();
  }
  return (create.mock.calls[0][0] as { data: never }).data;
}

describe("the MCAS example's VAIR terms agree everywhere", () => {
  const json = () => JSON.parse(readFileSync(JSON_FILE, "utf8"));
  const TAGS = ["systemType", "purpose", "targetSystemTags", "sectorTags", "marketFormTags", "localityTags"] as const;
  const TERMS = ["sourceTerm", "consequenceTerm", "impactTerm", "controlTerm", "followUpControlTerm"] as const;

  it("the metadata terms and tags", async () => {
    const seed = await seedData();
    for (const f of TAGS) {
      expect(MCAS.metadata[f], f).toEqual(json()[f]);
      expect(seed[f], f).toEqual(json()[f]);
    }
  });

  it("each risk's affected value", async () => {
    const seed = await seedData();
    json().risks.forEach((r: Record<string, unknown>, i: number) => {
      expect(MCAS.risks[i].affected, `risk ${i}`).toEqual(r.affected);
      expect(seed.risks.create[i].affected, `risk ${i}`).toEqual(r.affected);
    });
  });

  it("each risk's areas and terms", async () => {
    const seed = await seedData();
    json().risks.forEach((r: Record<string, unknown>, i: number) => {
      expect(MCAS.risks[i].areas, `risk ${i}`).toEqual(r.impactAreas);
      expect(seed.risks.create[i].impactAreas, `risk ${i}`).toEqual(r.impactAreas);
      for (const f of TERMS) {
        expect(MCAS.risks[i][f] || null, `risk ${i} ${f}`).toEqual(r[f]);
        expect(seed.risks.create[i][f], `risk ${i} ${f}`).toEqual(r[f]);
      }
    });
  });
});
