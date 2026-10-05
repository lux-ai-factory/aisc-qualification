import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { loadSrc } from "../support/forms";

// The /forms URLs of one-level forms are permanent (308) redirects to question sets and
// questionnaires. The ids are the same (a migrated questionnaire keeps its form's id), so
// /forms/<id>/... names the questionnaire.
//
// Each page is awaited as a server component with next/navigation mocked; permanentRedirect
// throws (as Next's does) with the URL, so the test reads where it went. The pages must not
// read a service: every service module is stubbed with nothing on it.

const { permanentRedirect, redirect, notFound } = vi.hoisted(() => ({
  permanentRedirect: vi.fn((url: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT ${url}`), {
      url,
      permanent: true,
    });
  }),
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT ${url}`), {
      url,
      permanent: false,
    });
  }),
  notFound: vi.fn(() => {
    throw Object.assign(new Error("NEXT_NOT_FOUND"), { notFound: true });
  }),
}));
vi.mock("next/navigation", () => ({
  permanentRedirect,
  redirect,
  notFound,
  useRouter: () => ({ push: vi.fn() }),
}));
// The project doors let these calls through: which project's database a forms page, action or
// route opens, and who may, is pinned by isolationForms.test.ts.
vi.mock("@/lib/projectDb", () => ({
  projectDbPastDoor: async () => ({}),
  projectDbForAction: async () => ({ db: {} }),
  projectDbForRoute: async () => ({}),
}));
vi.mock("@/server/services/QuestionnaireService", () => ({
  QuestionnaireService: class {},
  questionnaireService: {},
  questionnairesOn: () => ({}),
  questionnairesFor: async () => ({}),
}));
vi.mock("@/server/services/QuestionSetService", () => ({
  QuestionSetService: class {},
  questionSetService: {},
  questionSetsOn: () => ({}),
}));

const PAGES = {
  list: "app/p/[project]/forms/page.tsx",
  new: "app/p/[project]/forms/new/page.tsx",
  edit: "app/p/[project]/forms/[formId]/edit/page.tsx",
  import: "app/p/[project]/forms/import/page.tsx",
};
const EXPORT_ROUTE = "app/p/[project]/forms/[formId]/export/route.ts";

/** Await a page; the URL it permanently redirected to. Anything else fails the test. */
async function redirectOf(
  path: string,
  params: Record<string, string>,
  searchParams: Record<string, string> = {},
) {
  const { default: Page } = await loadSrc(path);
  try {
    await Page({
      params: Promise.resolve(params),
      searchParams: Promise.resolve(searchParams),
    });
  } catch (err) {
    const e = err as { url?: string; permanent?: boolean };
    if (e.url !== undefined) {
      expect(
        e.permanent,
        `${path} must use permanentRedirect (308), not redirect`,
      ).toBe(true);
      return e.url;
    }
    throw err;
  }
  throw new Error(`${path} rendered instead of redirecting`);
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the old /forms pages redirect permanently (T62)", () => {
  it("T62 /p/<p>/forms goes to /p/<p>/questionnaires", async () => {
    expect(await redirectOf(PAGES.list, { project: "mcas" })).toBe(
      "/p/mcas/questionnaires",
    );
    expect(permanentRedirect).toHaveBeenCalledTimes(1);
  });

  it("T62 /p/<p>/forms/new goes to /p/<p>/questionnaires/new", async () => {
    expect(await redirectOf(PAGES.new, { project: "mcas" })).toBe(
      "/p/mcas/questionnaires/new",
    );
  });

  it("T62 /p/<p>/forms/new?from=<id> keeps ?from=<id>", async () => {
    expect(
      await redirectOf(PAGES.new, { project: "mcas" }, { from: "acme" }),
    ).toBe("/p/mcas/questionnaires/new?from=acme");
  });

  it("T62 /p/<p>/forms/<id>/edit goes to /p/<p>/questionnaires/<id>/edit (same id, D1)", async () => {
    expect(
      await redirectOf(PAGES.edit, { project: "mcas", formId: "acme" }),
    ).toBe("/p/mcas/questionnaires/acme/edit");
  });

  it("T62 /p/<p>/forms/import goes to /p/<p>/question-sets/import (the old page imported question files)", async () => {
    expect(await redirectOf(PAGES.import, { project: "mcas" })).toBe(
      "/p/mcas/question-sets/import",
    );
  });

  it("T62 the project in the URL is kept: project b redirects inside /p/b/", async () => {
    expect(await redirectOf(PAGES.list, { project: "b" })).toBe(
      "/p/b/questionnaires",
    );
    expect(await redirectOf(PAGES.edit, { project: "b", formId: "acme" })).toBe(
      "/p/b/questionnaires/acme/edit",
    );
  });

  it("T62 the old pages are redirects only: none renders the builder, the library or the import preview", () => {
    for (const path of Object.values(PAGES)) {
      const src = readFileSync(`src/${path}`, "utf8");
      expect(src, path).toMatch(/permanentRedirect/);
      expect(src, path).not.toMatch(
        /FormBuilder|QuestionnaireBuilder|FormImport|builderData|formService/,
      );
    }
  });

  it("T62 the files the old routes were made of are gone (spec 5.4 'Files deleted')", () => {
    for (const f of [
      "src/app/p/[project]/forms/FormBuilder.tsx",
      "src/app/p/[project]/forms/actions.ts",
      "src/app/p/[project]/forms/libraryData.ts",
      "src/app/p/[project]/forms/import/FormImport.tsx",
      "src/app/p/[project]/forms/import/actions.ts",
    ]) {
      expect(existsSync(f), f).toBe(false);
    }
  });
});

describe("the old export route answers 308 to the questionnaire export (T62)", () => {
  async function get(url: string, formId: string, project = "mcas") {
    const { GET } = await loadSrc(EXPORT_ROUTE);
    return (await GET(new Request(url), {
      params: Promise.resolve({ project, formId }),
    })) as Response;
  }
  /** The Location, as a path with its query: relative as given, or an absolute URL's path and query. */
  const location = (res: Response) => {
    const loc = res.headers.get("location") ?? "";
    if (loc.startsWith("/")) return loc;
    const u = new URL(loc);
    return `${u.pathname}${u.search}`;
  };

  it("T62 GET /forms/<id>/export?format=csv&version=3 is 308 to /questionnaires/<id>/export with the same query", async () => {
    vi.stubEnv("NEXT_BASE_PATH", "");
    const res = await get(
      "http://q/p/mcas/forms/acme/export?format=csv&version=3",
      "acme",
    );
    expect(res.status).toBe(308);
    expect(location(res)).toBe(
      "/p/mcas/questionnaires/acme/export?format=csv&version=3",
    );
  });

  it("T62 the base path prefixes the Location", async () => {
    vi.stubEnv("NEXT_BASE_PATH", "/qualification");
    const res = await get(
      "http://q/qualification/p/mcas/forms/acme/export?format=md",
      "acme",
    );
    expect(res.status).toBe(308);
    expect(location(res)).toBe(
      "/qualification/p/mcas/questionnaires/acme/export?format=md",
    );
  });

  it("T62 the query is passed on as it came, whatever it holds (the new route judges it)", async () => {
    vi.stubEnv("NEXT_BASE_PATH", "");
    const res = await get(
      "http://q/p/mcas/forms/u1/export?format=pdf&version=x&extra=1",
      "u1",
    );
    expect(res.status).toBe(308);
    expect(location(res)).toBe(
      "/p/mcas/questionnaires/u1/export?format=pdf&version=x&extra=1",
    );
  });

  it("T62 an id with characters that need escaping stays escaped", async () => {
    vi.stubEnv("NEXT_BASE_PATH", "");
    const res = await get(
      "http://q/p/mcas/forms/a%20b/export?format=csv",
      "a b",
    );
    expect(location(res)).toBe(
      "/p/mcas/questionnaires/a%20b/export?format=csv",
    );
  });

  it("T62 the old route is GET only", async () => {
    const mod = await loadSrc(EXPORT_ROUTE);
    expect(typeof mod.GET).toBe("function");
    for (const m of ["POST", "PUT", "PATCH", "DELETE"])
      expect(mod[m]).toBeUndefined();
  });
});
