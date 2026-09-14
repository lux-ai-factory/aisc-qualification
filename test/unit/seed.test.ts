import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { seedMcas, MCAS_SEED, MCAS_ID } from "../../scripts/seed_mcas.mjs";

const root = path.join(__dirname, "..", "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

// A fake standing in for Prisma: it records what the seed asked of it, so the
// seed's own decisions are what gets tested, not a database.
function fakePrisma(
  rows: { id: string; systemName: string; systemVersion: string }[] = [],
) {
  const calls: string[] = [];
  return {
    calls,
    rows,
    qualification: {
      async findUnique({ where }: any) {
        calls.push("findUnique");
        return rows.find((r) => r.id === where.id) ?? null;
      },
      async create({ data }: any) {
        calls.push("create");
        const row = {
          id: data.id ?? `seeded-${rows.length}`,
          systemName: data.systemName,
          systemVersion: data.systemVersion,
          answers: data.answers.create,
          risks: data.risks.create,
        };
        rows.push(row as any);
        return row;
      },
      async delete({ where }: any) {
        calls.push("delete");
        const i = rows.findIndex((r) => r.id === where.id);
        rows.splice(i, 1);
        return {};
      },
    },
  };
}

describe("the MCAS seed", () => {
  it("writes the system on an empty database", async () => {
    const db = fakePrisma();
    await seedMcas(db as any);
    expect(db.rows.length).toBe(1);
    expect(db.rows[0].systemName).toBe("MicroCredit Assist Score (MCAS)");
  });

  it("always lands on the same id, so a link to it survives a reinstall", async () => {
    // The demo links to this qualification from outside the app (the wizard's
    // system card records it as its provenance). A fresh cuid per install would
    // break every one of those references.
    const db = fakePrisma();
    await seedMcas(db as any);
    expect(db.rows[0].id).toBe(MCAS_ID);
    expect(MCAS_ID).toMatch(/^c[a-z0-9]{20,}$/);
  });

  it("carries the whole walkthrough: every answer and every risk", async () => {
    const db = fakePrisma();
    await seedMcas(db as any);
    const row = db.rows[0] as any;
    expect(row.answers.length).toBe(14);
    expect(row.risks.length).toBe(5);
    // The Annex IV ids the form asks under, not the question set they replaced.
    expect(
      row.answers.map((a: any) => `${a.toolId}:${a.questionId}`),
    ).toContain("annex-1:1de");
  });

  it("leaves a database that already has it alone", async () => {
    // The migrate container runs on every `docker compose up`. A second run must
    // not add a second copy, and must not overwrite a card someone has edited.
    const db = fakePrisma();
    await seedMcas(db as any);
    await seedMcas(db as any);
    expect(db.rows.length).toBe(1);
    expect(db.calls.filter((c) => c === "create").length).toBe(1);
  });

  it("replaces the seeded system when asked to", async () => {
    const db = fakePrisma();
    await seedMcas(db as any);
    await seedMcas(db as any, { force: true });
    expect(db.rows.length).toBe(1);
    expect(db.calls).toContain("delete");
    expect(db.calls.filter((c) => c === "create").length).toBe(2);
  });

  it("is the seed Prisma runs, so the install seeds itself", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.prisma?.seed).toBeTruthy();
    const named = pkg.prisma.seed.split(/\s+/).pop();
    expect(existsSync(path.join(root, named))).toBe(true);
  });

  it("ships in the image the migrate container runs", () => {
    // `prisma db seed` runs inside the runner stage. Anything the seed reads has
    // to have been copied into it, or the install fails at seed time with a
    // module-not-found that no test would otherwise catch.
    const dockerfile = read("Dockerfile");
    const runner = dockerfile.slice(dockerfile.indexOf("AS runner"));
    const needs = ["/app/scripts", "/app/services/ontology/examples"];
    for (const dir of needs) {
      expect(runner).toContain(dir);
    }
  });

  it("reads only files that exist", () => {
    const source = read("scripts/seed_mcas.mjs");
    const imports = [...source.matchAll(/from\s+"(\.[^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(imports.length).toBeGreaterThan(0);
    for (const rel of imports) {
      expect(existsSync(path.join(root, "scripts", rel))).toBe(true);
    }
    expect(MCAS_SEED.systemName).toBe("MicroCredit Assist Score (MCAS)");
  });
});

describe("the two MCAS fixtures", () => {
  it("agree, so the seeded system and the prefilled form are one system", async () => {
    const { MCAS } = await import("@/data/examples/mcas");
    expect(MCAS_SEED.systemName).toBe(MCAS.metadata.systemName);
    expect(MCAS_SEED.systemVersion).toBe(MCAS.metadata.systemVersion);
    expect(MCAS_SEED.sectorTags).toEqual(MCAS.metadata.sectorTags);

    const db = fakePrisma();
    await seedMcas(db as any);
    const seeded = (db.rows[0] as any).answers
      .map((a: any) => `q:${a.toolId}:${a.questionId}`)
      .sort();
    expect(seeded).toEqual(Object.keys(MCAS.answers).sort());
    expect((db.rows[0] as any).risks.length).toBe(MCAS.risks.length);
  });
});
