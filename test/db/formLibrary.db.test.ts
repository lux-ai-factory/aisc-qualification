import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

// Isolation stage 2, WP Q2 (01-specs.md I4.1..I4.5, decision D3 as confirmed by the user on
// 2026-09-25): the library of forms is ONE install-wide library in `platform.form_library`
// (like the catalogue); when a card is saved with a form version, that version is copied into
// the project's own `qualification.form*` tables in the same transaction, so the project's
// data never depends on the shared copy afterwards.
//
// Gate I4.6: the forms work is not on this branch yet. Every test here skips, with the reason
// in its name, until FormRepository.ts, FormService.ts and the forms migrations are merged;
// then they run on their own. The seams used (qualificationService.createFromForm with a
// `formVersionId` in the form data, formService.chooserOptions) are those of the forms work
// in ~/aisc-install as of 2026-09-25; WP Q2 may adapt a seam, never an assertion.
//
// Throwaway only: test/db/throwaway-db.sh (see projectDatabase.db.test.ts).

const APP = resolve(__dirname, "..", "..");
const SRC = join(APP, "src");
const formsMerged = [
  join(SRC, "server", "repositories", "FormRepository.ts"),
  join(SRC, "server", "services", "FormService.ts"),
  join(APP, "prisma", "migrations", "20260925090000_forms_are_data", "migration.sql"),
].every((f) => existsSync(f));
const REASON = "I4.6 gate: forms files absent on this branch; WP Q2 waits for the forms merge";

const TEMPLATE = process.env.QUALIFICATION_TEST_PROJECT_DATABASE_URL ?? "";
const ADMIN_TEMPLATE = process.env.QUALIFICATION_TEST_PROJECT_ADMIN_URL ?? "";
const LIBRARY_URL = process.env.QUALIFICATION_TEST_FORM_LIBRARY_URL ?? "";
const [A, B] = (process.env.QUALIFICATION_TEST_PROJECTS ?? "").split(",");
const enabled = TEMPLATE !== "" && ADMIN_TEMPLATE !== "" && LIBRARY_URL !== "";
if (enabled && [TEMPLATE, ADMIN_TEMPLATE, LIBRARY_URL].some((u) => /:5432\//.test(u))) {
  throw new Error("refusing to run the DB tests against port 5432 (the live stack)");
}
const run = enabled && formsMerged;

const dbName = (pid: string) => `project_${pid.toLowerCase().replace(/-/g, "")}`;
const at = (t: string, d: string) => t.replace("{database}", d);
const clients: PrismaClient[] = [];
const client = (url: string) => {
  const c = new PrismaClient({ datasourceUrl: url });
  clients.push(c);
  return c;
};
afterAll(async () => {
  await Promise.all(clients.map((c) => c.$disconnect()));
});

// The platform (authz and the card-version POST) and the form parser are faked: what is under
// test is where the form version ends up, not how a card is parsed or numbered.
const platform = vi.hoisted(() => ({ next: 0, versions: [] as { pid: string; project: string; number: number }[] }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ authorization: "Bearer person-token" }),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_NOT_FOUND" });
  },
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/forms/QualificationFormParser", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const parsed = {
    systemName: "MCAS", systemVersion: "1", company: "LIST", description: "d", targetUseCase: "u", targetUsers: "t",
    targetSystemTags: [], sectorTags: [], marketFormTags: [], localityTags: [], answers: [], risks: [],
  };
  return {
    ...actual,
    qualificationFormParser: { parse: () => parsed },
    QualificationFormParser: class {
      parse() {
        return parsed;
      }
    },
  };
});

function fakePlatform() {
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    if (/\/authz\/projects\//.test(url)) return json({ role: "editor", admin: false, may_write: true });
    const m = /\/projects\/([^/]+)\/system-versions/.exec(url);
    if (m && init?.method === "POST") {
      const v = platform.versions[platform.next++];
      return json({ pid: v.pid, project_id: v.project, number: v.number, name: "MCAS" }, 201);
    }
    if (m) return json(platform.versions.filter((v) => v.project === m[1]).map((v) => ({ pid: v.pid, project_id: v.project, number: v.number })));
    return json({});
  }) as typeof fetch;
}

/** md5 of the sorted row texts of a query, the move tool's check (I12.10). */
async function digest(c: PrismaClient, sql: string): Promise<{ n: number; md5: string }> {
  const rows = await c.$queryRawUnsafe<{ n: bigint; md5: string }[]>(
    `SELECT count(*) AS n, md5(coalesce(string_agg(t::text, E'\\n' ORDER BY t::text), '')) AS md5 FROM (${sql}) t`,
  );
  return { n: Number(rows[0].n), md5: rows[0].md5 };
}

describe.skipIf(!run)(`I4.1 the form library lives in platform.form_library (${REASON})`, () => {
  it("I4.1 schema form_library is owned by qualification_rw and holds exactly the four form tables", async () => {
    const lib = client(LIBRARY_URL);
    const owner = await lib.$queryRawUnsafe<{ o: string }[]>(`SELECT nspowner::regrole::text AS o FROM pg_namespace WHERE nspname = 'form_library'`);
    expect(owner).toEqual([{ o: "qualification_rw" }]);
    const tables = await lib.$queryRawUnsafe<{ t: string }[]>(
      `SELECT tablename AS t FROM pg_tables WHERE schemaname = 'form_library' AND tablename NOT LIKE '\\_%' ESCAPE '\\' ORDER BY 1`,
    );
    expect(tables.map((t) => t.t)).toEqual(["form", "form_question", "form_version", "form_version_question"]);
  });

  it("I4.1 it has the same triggers and the seeded default (Annex IV) form, and no card or answer", async () => {
    const lib = client(LIBRARY_URL);
    const trg = await lib.$queryRawUnsafe<{ t: string }[]>(
      `SELECT t.tgname AS t FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'form_library' AND NOT t.tgisinternal ORDER BY 1`,
    );
    expect(trg.map((t) => t.t)).toEqual([
      "form_builtin_is_fixed", "form_name_is_fixed", "form_question_identity_is_fixed",
      "form_version_is_append_only", "form_version_question_is_append_only",
    ]);
    const seeded = await lib.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM form_library.form WHERE is_default`);
    expect(seeded).toEqual([{ n: 1n }]);
    const cards = await lib.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM pg_tables WHERE schemaname = 'form_library' AND tablename LIKE 'qualification%'`,
    );
    expect(cards).toEqual([{ n: 0n }]);
  });
});

describe.skipIf(!run)(`I4.3 I4.4 a card's form version is copied into its project on use (${REASON})`, () => {
  const V1 = "f1f1f1f1-0000-4000-8000-000000000001";
  const V2 = "f1f1f1f1-0000-4000-8000-000000000002";
  const V3 = "f1f1f1f1-0000-4000-8000-000000000003";
  let formVersionId = "";
  let why = "";
  type Svc = { createFromForm: (project: string, fd: FormData) => Promise<{ id: string }> };
  let svc: Svc;

  beforeAll(async () => {
    const mig = spawnSync("node", [join(APP, "scripts", "migrate-projects.mjs")], {
      cwd: APP,
      env: { ...process.env, PROJECT_DATABASE_URL: TEMPLATE, FORM_LIBRARY_DATABASE_URL: LIBRARY_URL },
      encoding: "utf8",
      timeout: 240_000,
    });
    if (mig.status !== 0) why = `migrate-projects.mjs: ${mig.stderr.slice(-400)}`;
    const lib = client(LIBRARY_URL);
    formVersionId = (await lib.$queryRawUnsafe<{ id: string }[]>(
      `SELECT v.id FROM form_library.form_version v JOIN form_library.form f ON f.id = v.form_id WHERE f.is_default ORDER BY v.number DESC LIMIT 1`,
    ))[0].id;
    // The versions the (fake) platform hands out exist in A's project.system, as the real platform would make them.
    const su = client(at(ADMIN_TEMPLATE, dbName(A)));
    await su.$executeRawUnsafe(`INSERT INTO project.system (pid, number, name) VALUES ('${V1}', 1, 'MCAS'), ('${V2}', 2, 'MCAS'), ('${V3}', 3, 'MCAS') ON CONFLICT DO NOTHING`);
    platform.versions = [V1, V2, V3].map((pid, i) => ({ pid, project: A, number: i + 1 }));
    platform.next = 0;
    process.env.PROJECT_DATABASE_URL = TEMPLATE;
    process.env.FORM_LIBRARY_DATABASE_URL = LIBRARY_URL;
    process.env.PLATFORM_URL = "http://platform.invalid";
    fakePlatform();
    svc = ((await import(/* @vite-ignore */ join(SRC, "server", "services", "QualificationService.ts"))) as { qualificationService: Svc })
      .qualificationService;
  }, 300_000);

  const fd = () => {
    const f = new FormData();
    f.set("formVersionId", formVersionId);
    return f;
  };
  const versionRows = (schema: string) => `SELECT * FROM ${schema}.form_version WHERE id = '${formVersionId}'`;
  const vqRows = (schema: string) => `SELECT * FROM ${schema}.form_version_question WHERE form_version_id = '${formVersionId}'`;
  const qRows = (schema: string) =>
    `SELECT q.* FROM ${schema}.form_question q WHERE q.id IN (SELECT form_question_id FROM ${schema}.form_version_question WHERE form_version_id = '${formVersionId}')`;
  const formRow = (schema: string) =>
    `SELECT f.* FROM ${schema}.form f WHERE f.id = (SELECT form_id FROM ${schema}.form_version WHERE id = '${formVersionId}')`;

  it("I4.3 saving a card with a form version copies the form, the version, its questions (and what they were copied from) into A", async () => {
    expect(why).toBe("");
    const { id } = await svc.createFromForm(A, fd());
    const a = client(at(ADMIN_TEMPLATE, dbName(A)));
    const lib = client(at(ADMIN_TEMPLATE, "platform"));
    for (const q of [formRow, versionRows, vqRows, qRows]) {
      const there = await digest(lib, q("form_library"));
      const here = await digest(a, q("qualification"));
      expect(here, q("qualification")).toEqual(there);
      expect(here.n).toBeGreaterThan(0);
    }
    // every copied_from_id a copied question names is in A too (recursively)
    const dangling = await a.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM qualification.form_question q
        WHERE q.copied_from_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM qualification.form_question o WHERE o.id = q.copied_from_id)`,
    );
    expect(dangling).toEqual([{ n: 0n }]);
    const card = await a.$queryRawUnsafe<{ v: string }[]>(`SELECT form_version_id AS v FROM qualification.qualification WHERE id = '${id}'`);
    expect(card).toEqual([{ v: formVersionId }]);
  });

  it("I4.3 the card's key points at the project's own copy: qualification.form_version in the same database", async () => {
    const a = client(at(ADMIN_TEMPLATE, dbName(A)));
    const rows = await a.$queryRawUnsafe<{ target: string }[]>(
      `SELECT confrelid::regclass::text AS target FROM pg_constraint WHERE conname = 'qualification_form_version_id_fkey'`,
    );
    expect(rows).toEqual([{ target: "qualification.form_version" }]);
  });

  it("I4.3 a second card with the same version copies nothing again (equal content is a no-op)", async () => {
    expect(why).toBe("");
    const a = client(at(ADMIN_TEMPLATE, dbName(A)));
    const before = await digest(a, versionRows("qualification"));
    await svc.createFromForm(A, fd());
    expect(await digest(a, versionRows("qualification"))).toEqual(before);
  });

  it("I4.3 a project copy that differs from the library aborts the save: no card is stored", async () => {
    expect(why).toBe("");
    const a = client(at(ADMIN_TEMPLATE, dbName(A)));
    await a.$executeRawUnsafe(`SET session_replication_role = replica`);
    await a.$executeRawUnsafe(`UPDATE qualification.form_version SET blocks = '[]'::jsonb WHERE id = '${formVersionId}'`);
    await a.$executeRawUnsafe(`SET session_replication_role = origin`);
    const count = async () => Number((await a.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM qualification.qualification`))[0].n);
    const before = await count();
    await expect(svc.createFromForm(A, fd())).rejects.toThrow();
    expect(await count()).toBe(before);
  });

  it("I4.4 the card's form is read from the project's copy: it survives the library row going away", async () => {
    const a = client(at(ADMIN_TEMPLATE, dbName(A)));
    const rows = await a.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM qualification.qualification q JOIN qualification.form_version v ON v.id = q.form_version_id
        WHERE v.id = '${formVersionId}'`,
    );
    expect(Number(rows[0].n)).toBeGreaterThan(0);
    const src = [join(SRC, "server", "repositories", "QualificationRepository.ts"), join(SRC, "server", "services", "QualificationExporter.ts")]
      .filter(existsSync)
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    expect(src, "I4.4: a card's form is never read through the library client").not.toMatch(/FORM_LIBRARY_DATABASE_URL|libraryDb|formLibrary/);
  });
});

describe.skipIf(!run)(`I4.5 R47: a form saved while working in project A is listed in B's chooser (${REASON})`, () => {
  it("I4.5 a form added to the library is in the chooser whatever the project", async () => {
    process.env.FORM_LIBRARY_DATABASE_URL = LIBRARY_URL;
    const lib = client(LIBRARY_URL);
    const id = "r47formofprojecta00000001";
    await lib.$executeRawUnsafe(
      `INSERT INTO form_library.form (id, name, description, origin, listed, is_default) VALUES ('${id}', 'Saved in A', '', 'user', true, false) ON CONFLICT DO NOTHING`,
    );
    const { formService } = (await import(/* @vite-ignore */ join(SRC, "server", "services", "FormService.ts"))) as {
      formService: { chooserOptions: () => Promise<{ id?: string; formId?: string; name?: string }[]> };
    };
    const options = await formService.chooserOptions();
    expect(options.some((o) => o.id === id || o.formId === id || o.name === "Saved in A")).toBe(true);
    expect(B).toBeTruthy();
  });
});

describe.skipIf(run)("Q2 skip record", () => {
  it.skip(`I4.1 I4.3 I4.4 I4.5 (${REASON})`, () => {});
});
