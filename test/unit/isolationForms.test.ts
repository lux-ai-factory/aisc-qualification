import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";

// Forms inside a project: the question sets and questionnaires a person makes live in their
// own project's database, like its cards. The builtin Annex IV set and default questionnaire are
// seeded into every project database by the forms migrations, so they are the same, and
// read-only, everywhere. Reuse across projects is by export and import only.
//
// So every forms page, action and route under /p/{pid} opens the database of that pid and
// no other, through the doors of src/lib/projectDb.ts: a stranger to the project is 404 and
// a viewer is refused a write, both before any database is opened. The services are faked
// here: what is checked is which database they are handed.

const caller = vi.hoisted(() => ({ auth: "Bearer person-token" as string | null }));
const handed = vi.hoisted(() => ({ sets: [] as string[], questionnaires: [] as string[] }));

vi.mock("@prisma/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@prisma/client")>();
  const { FakePrismaClient } = await import("../support/isolation");
  return { ...actual, PrismaClient: FakePrismaClient };
});
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const ok = (...args: unknown[]) => {
    const cb = args[args.length - 1];
    if (typeof cb === "function") (cb as (e: null, out: string, err: string) => void)(null, "", "");
    return { on: () => undefined } as unknown;
  };
  return { ...actual, execFile: ok, exec: ok, execFileSync: () => "", execSync: () => "" };
});
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_NOT_FOUND" });
  },
  redirect: () => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT" });
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(caller.auth ? { authorization: caller.auth } : {}),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/server/access/callerName", () => ({ callerName: async () => "tester" }));

// A service that answers every call with nothing, and records the database it was made on.
function stubService(): Record<string, unknown> {
  const saved = { ok: true, setId: "s", questionnaireId: "q", versionId: "v", number: 1, created: true };
  return new Proxy({}, {
    get: (_t, name) => {
      if (name === "then") return undefined;
      return vi.fn(async () => {
        if (/^(save|retire|import)/.test(String(name))) return saved;
        if (/^(list|history|groups|chooserOptions|library)/.test(String(name))) return [];
        if (name === "resolveReferences") return { ok: true, picks: [] };
        return null;
      });
    },
  });
}
const urlOf = (db: unknown) => String((db as { url?: string }).url ?? "");
vi.mock("@/server/services/QuestionSetService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/QuestionSetService")>();
  return {
    ...actual,
    questionSetsOn: (db: unknown) => {
      handed.sets.push(urlOf(db));
      return stubService();
    },
  };
});
vi.mock("@/server/services/QuestionnaireService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/QuestionnaireService")>();
  const on = (db: unknown) => {
    handed.questionnaires.push(urlOf(db));
    return stubService();
  };
  return {
    ...actual,
    questionnairesOn: on,
    questionnairesFor: async (project: string) => {
      const { projectDbPastDoor } = await import("@/lib/projectDb");
      return on(await projectDbPastDoor(project));
    },
  };
});

import {
  MEMBER,
  SRC,
  STRANGER,
  VIEWER,
  constructedUrls,
  dbName,
  fakeDatabases,
  load,
  read,
  rel,
  resetFakes,
  sourceFiles,
  type Access,
} from "../support/isolation";

const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";
const PLATFORM = "http://platform:8000";
const P = join(SRC, "app", "p", "[project]");

let access: Record<string, Access> = {};

function fetchStub(input: unknown, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : String((input as { url?: string }).url ?? input);
  const json = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  const m = /\/authz\/projects\/([^/?]+)/.exec(url);
  if (m) {
    const auth = new Headers(init?.headers as HeadersInit).get("authorization");
    return json(auth ? (access[decodeURIComponent(m[1])] ?? STRANGER) : STRANGER);
  }
  return json({});
}

const opened = () => constructedUrls.map((u) => (u.includes(`/${dbName(A)}`) ? "A" : u.includes(`/${dbName(B)}`) ? "B" : u));
const handedAll = () => [...handed.sets, ...handed.questionnaires].map((u) => (u.includes(`/${dbName(A)}`) ? "A" : u.includes(`/${dbName(B)}`) ? "B" : u));

beforeEach(async () => {
  await (await load<{ closeProjectDatabases?: () => Promise<void> }>(join(SRC, "lib", "projectDb.ts"))).mod?.closeProjectDatabases?.();
  resetFakes();
  handed.sets.length = 0;
  handed.questionnaires.length = 0;
  access = {};
  caller.auth = "Bearer person-token";
  vi.stubEnv("PROJECT_DATABASE_URL", "postgresql://qualification_rw:pw@postgres:5432/{database}?schema=qualification&connection_limit=2");
  vi.stubEnv("PLATFORM_URL", PLATFORM);
  vi.stubGlobal("fetch", vi.fn(fetchStub));
  fakeDatabases.set(dbName(A), { qualification: [] });
  fakeDatabases.set(dbName(B), { qualification: [] });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Run a page, an action or a route; a redirect or a render problem after the lookup is not the point here. */
async function settle(p: Promise<unknown>): Promise<unknown> {
  try {
    return await p;
  } catch (err) {
    return err;
  }
}
const isNotFound = (x: unknown) => (x as { digest?: string } | null)?.digest === "NEXT_NOT_FOUND";

type Mod = Record<string, (...a: never[]) => Promise<unknown>>;
async function mod(file: string): Promise<Mod> {
  const { mod: m, why } = await load<Mod>(file);
  expect(m, why).not.toBeNull();
  return m!;
}

// The actions: the door of the project they name, before anything is opened

const WRITES: Array<[string, string, (pid: string) => unknown[]]> = [
  ["question-sets/actions.ts", "saveQuestionSet", (pid) => [pid, JSON.stringify({ name: "S", questions: [{ text: "Q?", citation: "", required: false, annexPoint: null }] })]],
  ["question-sets/actions.ts", "retireQuestionSet", (pid) => [pid, "set-1"]],
  ["questionnaires/actions.ts", "saveQuestionnaire", (pid) => [pid, JSON.stringify({ name: "Q", blocks: [], items: [] })]],
  ["questionnaires/actions.ts", "useQuestionnaireOnce", (pid) => [pid, JSON.stringify({ name: "Q", blocks: [], items: [] })]],
  ["questionnaires/actions.ts", "retireQuestionnaire", (pid) => [pid, "questionnaire-1"]],
  ["questionnaires/import/actions.ts", "importSelfContained", (pid) => [pid, JSON.stringify({ items: [] }), "S", "Q"]],
];

describe("forms actions act in the database of the project they name", () => {
  for (const [file, name, args] of WRITES) {
    it(`${name}: a stranger to A gets an error and no database is opened`, async () => {
      access = { [A]: STRANGER };
      const m = await mod(join(P, file));
      const out = await settle(m[name](...(args(A) as never[])));
      expect(isNotFound(out) || typeof (out as { error?: unknown })?.error === "string", `${name} answered ${String(out)}`).toBe(true);
      expect(opened()).toEqual([]);
      expect(handedAll()).toEqual([]);
    });

    it(`${name}: a viewer of A is refused the write (403) before anything is opened`, async () => {
      access = { [A]: VIEWER };
      const m = await mod(join(P, file));
      const out = (await settle(m[name](...(args(A) as never[])))) as { error?: string };
      const { REFUSED } = await import("@/server/access/projectAccess");
      expect(out?.error, `${name} let a viewer write`).toBe(REFUSED[403]);
      expect(opened()).toEqual([]);
      expect(handedAll()).toEqual([]);
    });

    it(`${name}: an editor of A and B acting on A works on A's database only`, async () => {
      access = { [A]: MEMBER, [B]: MEMBER };
      const m = await mod(join(P, file));
      await settle(m[name](...(args(A) as never[])));
      expect(opened()).toEqual(["A"]);
      expect(handedAll().length).toBeGreaterThan(0);
      expect(new Set(handedAll())).toEqual(new Set(["A"]));
    });
  }

  it("readQuestionnaireFile resolves a file's references in the database of the project it names", async () => {
    access = { [A]: MEMBER, [B]: MEMBER };
    const m = await mod(join(P, "questionnaires", "import", "actions.ts"));
    const fd = new FormData();
    fd.set("file", new File([JSON.stringify({ bundle: "references", name: "Q", blocks: [], items: [] })], "q.json"));
    await settle(m.readQuestionnaireFile(...([B, fd] as never[])));
    expect(opened()).not.toContain("A");
  });
});

// The pages: past the middleware's door, on the database of the page's pid

const PAGES: Array<[string, Record<string, string>, Record<string, string>]> = [
  ["question-sets/page.tsx", {}, {}],
  ["question-sets/[setId]/page.tsx", { setId: "set-1" }, {}],
  ["question-sets/[setId]/edit/page.tsx", { setId: "set-1" }, {}],
  ["questionnaires/page.tsx", {}, {}],
  ["questionnaires/new/page.tsx", {}, {}],
  ["questionnaires/[questionnaireId]/edit/page.tsx", { questionnaireId: "questionnaire-1" }, {}],
  ["system/edit/page.tsx", {}, { questionnaire: "questionnaire-1" }],
];

describe("forms pages read the database of the page's project", () => {
  for (const [file, params, searchParams] of PAGES) {
    it(`/p/B/${file.replace(/\/?page\.tsx$/, "")}: only B's database is opened, and the forms come from it`, async () => {
      access = { [A]: MEMBER, [B]: MEMBER };
      const m = await mod(join(P, file));
      await settle(
        m.default(...([{ params: Promise.resolve({ project: B, ...params }), searchParams: Promise.resolve(searchParams) }] as never[])),
      );
      expect(opened()).not.toContain("A");
      expect(handedAll().length, `${file} read no forms`).toBeGreaterThan(0);
      expect(new Set(handedAll())).toEqual(new Set(["B"]));
    });
  }
});

// The export routes: the route door

const EXPORTS: Array<[string, Record<string, string>]> = [
  ["question-sets/[setId]/export/route.ts", { setId: "set-1" }],
  ["questionnaires/[questionnaireId]/export/route.ts", { questionnaireId: "questionnaire-1" }],
];

describe("forms export routes answer from the database of the pid in the URL", () => {
  for (const [file, params] of EXPORTS) {
    it(`${file}: a stranger to A gets 404 and nothing is opened`, async () => {
      access = { [A]: STRANGER };
      const m = await mod(join(P, file));
      const res = (await settle(
        m.GET(...([new Request(`http://q/p/${A}/x?format=csv`), { params: Promise.resolve({ project: A, ...params }) }] as never[])),
      )) as Response;
      expect(isNotFound(res) || res?.status === 404, `${file} answered ${res?.status}`).toBe(true);
      expect(opened()).toEqual([]);
    });

    it(`${file}: a member of A and B exporting under B reads B's database only`, async () => {
      access = { [A]: MEMBER, [B]: MEMBER };
      const m = await mod(join(P, file));
      await settle(m.GET(...([new Request(`http://q/p/${B}/x?format=csv`), { params: Promise.resolve({ project: B, ...params }) }] as never[])));
      expect(opened()).toEqual(["B"]);
      expect(new Set(handedAll())).toEqual(new Set(["B"]));
    });
  }
});

// The source: no way around the doors

describe("the forms code has no install-wide way in", () => {
  it("no file in src/ uses the old install-wide forms singletons", () => {
    const offenders = sourceFiles()
      .filter((f) => /\bquestion(naire|Set)Service\s*\./.test(read(f)) || /\bimport\s*\{[^}]*\bquestion(naire|Set)Service\b[^}]*\}/.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("the forms repositories need a database: none defaults to a global client", () => {
    for (const f of ["QuestionSetRepository.ts", "QuestionnaireRepository.ts"]) {
      const text = read(join(SRC, "server", "repositories", f));
      expect(text, f).not.toMatch(/PrismaClient\s*=\s*prisma/);
      expect(text, f).not.toMatch(/@\/lib\/prisma/);
    }
  });
});
