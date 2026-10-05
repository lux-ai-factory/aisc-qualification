import { describe, it, expect, vi, beforeEach } from "vitest";
import { transactional } from "../support/ledgerRepo";

// The card agent reads the form from GET /p/{pid}/api/qualifications/:id/extracted and
// publishes its draft with PUT on the same path (under the project whose database holds the
// card). It is a service with no user behind it, so a user check would answer 404. It sends a
// token of its own (QUALIFICATION_AGENTS_TO_WEB_TOKEN, in X-AISC-Service-Token), accepted on
// exactly these two routes, compared in constant time and failing closed: 503
// when this app has no token set, 401 when the one sent is wrong. With the token
// the route still checks that the qualification exists (in that project's database,
// opened without a platform question) and uses that project.

const OWN = "a1b2c3d4-0000-4000-8000-000000000002";
// Split so the credential scanner (secrets.test.ts) does not read it as a real one.
const TOKEN = ["agent", "to", "web", "test", "value", "0001"].join("-");
const HEADER = "X-AISC-Service-Token";

const db = { own: "database of OWN" };
const notFound = () => new Response("Not found", { status: 404 });
/** The person's door: a stranger (the tests' default) is 404. */
const personDoor = vi.fn(
  async (_pid: string, _o: { write: boolean }): Promise<unknown> => notFound(),
);
/** The agent's door (its token already checked): the project's database. */
const serviceDoor = vi.fn(async (_pid: string): Promise<unknown> => db);
const repo = transactional({
  find: vi.fn(
    async (id: string): Promise<unknown> => ({ id, ontologyExtracted: null }),
  ),
  cardSummary: vi.fn(
    async (id: string): Promise<unknown> => ({ id, systemId: "v2" }),
  ),
  saveOntologyExtracted: vi.fn(async () => ({})),
  isLatest: vi.fn(async (_systemId: string) => true),
});
const opened: unknown[] = [];
/** The builder's check of a draft before it is stored (code review B1, 2026-10-05). */
const checkExtracted = vi.fn(
  async (..._a: unknown[]): Promise<void> => undefined,
);
const platformLatest = vi.fn(async () => ({ pid: "v2" }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/projectDb", () => ({
  projectDbForRoute: personDoor,
  projectDbForService: serviceDoor,
}));
vi.mock("@/server/repositories/QualificationRepository", () => ({
  QualificationRepository: class {
    constructor(d: unknown) {
      opened.push(d);
      return repo;
    }
  },
}));
vi.mock("@/server/services/PlatformClient", () => ({
  PlatformClient: class {},
  platformClient: { latestVersion: platformLatest },
}));
vi.mock("@/server/services/OntologyService", () => ({
  ontologyService: { build: vi.fn(async () => ({})), checkExtracted },
}));
vi.mock("@/server/services/QualificationExporter", () => ({
  toExport: (q: { id: string }) => ({ id: q.id }),
}));
vi.mock("@/server/services/FormService", () => ({
  formService: { resolve: async () => null },
}));

const route = () =>
  import("@/app/p/[project]/api/qualifications/[id]/extracted/route");
const ctx = (id = "q1") => ({ params: Promise.resolve({ project: OWN, id }) });
const get = (headers: Record<string, string> = {}) =>
  new Request(
    `http://q/p/${OWN}/api/qualifications/q1/extracted?project=b0000000-0000-4000-8000-000000000009`,
    { headers },
  );
const put = (headers: Record<string, string> = {}) =>
  new Request(`http://q/p/${OWN}/api/qualifications/q1/extracted`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ techniques: [] }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("QUALIFICATION_AGENTS_TO_WEB_TOKEN", TOKEN);
  opened.length = 0;
  serviceDoor.mockResolvedValue(db);
  personDoor.mockResolvedValue(notFound());
  repo.find.mockImplementation(async (id: string) => ({
    id,
    ontologyExtracted: null,
  }));
  repo.cardSummary.mockImplementation(async (id: string) => ({
    id,
    systemId: "v2",
  }));
  repo.isLatest.mockResolvedValue(true);
  checkExtracted.mockResolvedValue(undefined);
});

describe("the agent's token opens GET and PUT /extracted", () => {
  it("GET with the token reads the card in its project's database, without asking who the user is", async () => {
    const res = await (await route()).GET(get({ [HEADER]: TOKEN }), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).projectId).toBe(OWN);
    expect(serviceDoor).toHaveBeenCalledWith(OWN);
    expect(personDoor).not.toHaveBeenCalled();
    expect(opened).toEqual([db]);
    expect(repo.find).toHaveBeenCalledWith("q1");
  });

  it("GET with the token for a qualification that does not exist is 404", async () => {
    repo.find.mockResolvedValueOnce(null);
    const res = await (await route()).GET(get({ [HEADER]: TOKEN }), ctx());
    expect(res.status).toBe(404);
  });

  it("PUT with the token stores the draft in the card's own project database", async () => {
    const res = await (await route()).PUT(put({ [HEADER]: TOKEN }), ctx());
    expect(res.status).toBe(200);
    expect(personDoor).not.toHaveBeenCalled();
    expect(serviceDoor).toHaveBeenCalledWith(OWN);
    expect(repo.cardSummary).toHaveBeenCalledWith("q1");
    expect(repo.saveOntologyExtracted).toHaveBeenCalledWith(
      "q1",
      expect.anything(),
    );
  });

  it("PUT with the token asks the database, not the platform, whether the card is the latest", async () => {
    // The platform's /system-versions/latest wants a user; the agent has none. The
    // database function is the rule the only-latest triggers enforce.
    repo.isLatest.mockResolvedValueOnce(false);
    const res = await (await route()).PUT(put({ [HEADER]: TOKEN }), ctx());
    expect(res.status).toBe(403);
    expect(repo.isLatest).toHaveBeenCalledWith("v2");
    expect(platformLatest).not.toHaveBeenCalled();
    expect(repo.saveOntologyExtracted).not.toHaveBeenCalled();
  });

  it("PUT with the token for a qualification that does not exist is 404", async () => {
    repo.cardSummary.mockResolvedValueOnce(null);
    const res = await (await route()).PUT(put({ [HEADER]: TOKEN }), ctx());
    expect(res.status).toBe(404);
    expect(repo.saveOntologyExtracted).not.toHaveBeenCalled();
  });
});

describe("the token fails closed", () => {
  it("a wrong token is 401 on both, and nothing is opened, read or stored", async () => {
    const r = await route();
    expect((await r.GET(get({ [HEADER]: TOKEN + "x" }), ctx())).status).toBe(
      401,
    );
    expect((await r.PUT(put({ [HEADER]: "wrong" }), ctx())).status).toBe(401);
    expect(serviceDoor).not.toHaveBeenCalled();
    expect(personDoor).not.toHaveBeenCalled();
    expect(repo.find).not.toHaveBeenCalled();
    expect(repo.saveOntologyExtracted).not.toHaveBeenCalled();
  });

  it("a token sent to an app that has none set is 503, even an empty one", async () => {
    vi.stubEnv("QUALIFICATION_AGENTS_TO_WEB_TOKEN", "");
    const r = await route();
    expect((await r.GET(get({ [HEADER]: TOKEN }), ctx())).status).toBe(503);
    expect((await r.PUT(put({ [HEADER]: "" }), ctx())).status).toBe(503);
    expect(repo.saveOntologyExtracted).not.toHaveBeenCalled();
  });

  it("without the header the user rules apply as before", async () => {
    const r = await route();
    expect((await r.GET(get(), ctx())).status).toBe(404);
    expect(personDoor).toHaveBeenCalledWith(OWN, { write: false });
    expect((await r.PUT(put(), ctx())).status).toBe(404);
    expect(personDoor).toHaveBeenCalledWith(OWN, { write: true });
    expect(serviceDoor).not.toHaveBeenCalled();
  });
});

describe("the token opens nothing else", () => {
  it("the fill route, given the token and no user, is still 404", async () => {
    const { GET } =
      await import("@/app/p/[project]/api/qualifications/[id]/fill/route");
    const res = await GET(
      new Request(`http://q/p/${OWN}/api/qualifications/q1/fill`, {
        headers: { [HEADER]: TOKEN },
      }),
      ctx(),
    );
    expect(res.status).toBe(404);
    expect(personDoor).toHaveBeenCalledWith(OWN, { write: false });
    expect(serviceDoor).not.toHaveBeenCalled();
  });

  it("only the extracted route reads the agent's token", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const readers: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (
          /\.tsx?$/.test(name) &&
          readFileSync(path, "utf8").includes(
            "QUALIFICATION_AGENTS_TO_WEB_TOKEN",
          )
        )
          readers.push(path.replace(/\\/g, "/"));
      }
    };
    walk("src");
    expect(readers).toEqual([
      "src/app/p/[project]/api/qualifications/[id]/extracted/route.ts",
    ]);
  });
});

describe("PUT /extracted stores only a draft the builder accepts (B1)", () => {
  it("a draft the builder refuses is 422 with its message, and nothing is stored", async () => {
    const { OntologyRejected } =
      await import("@/server/services/OntologyClient");
    checkExtracted.mockRejectedValueOnce(
      new OntologyRejected("'Foo' is not a term VAIR defines"),
    );
    const res = await (await route()).PUT(put({ [HEADER]: TOKEN }), ctx());
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/Foo/);
    expect(checkExtracted).toHaveBeenCalledWith(OWN, "q1", { techniques: [] });
    expect(repo.saveOntologyExtracted).not.toHaveBeenCalled();
  });

  it("an ontology service that does not answer does not lose the draft: it is stored", async () => {
    checkExtracted.mockRejectedValueOnce(
      new Error("Ontology service error 502: down"),
    );
    const res = await (await route()).PUT(put({ [HEADER]: TOKEN }), ctx());
    expect(res.status).toBe(200);
    expect(repo.saveOntologyExtracted).toHaveBeenCalledWith(
      "q1",
      expect.anything(),
    );
  });
});
