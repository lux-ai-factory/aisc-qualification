import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// WP7 (pipeline 2026-09-23). Control objectives reads the card of one system
// version by that version's pid:
//   GET /p/{project}/api/system-versions/{systemPid}/ontology.jsonld
// It asks the platform who the caller is (fetchAccess), finds the card by
// systemId, checks it belongs to that project, and hands over exactly the
// bytes the existing /api/qualifications/{id}/ontology.jsonld hands over
// (knowledgeGraphStore.deliver); 502 when the builder is down.
//
// ASSUMED: the {project} segment in these tests is the project's pid, the same
// value the card stores in projectId.

const ROUTE_FILE = "src/app/p/[project]/api/system-versions/[systemPid]/ontology.jsonld/route.ts";
// A runtime path: an alias in a non-literal import is not resolved.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = (path: string): Promise<any> => import(/* @vite-ignore */ resolve(path));
const ROUTE = ROUTE_FILE;

const PROJECT = "a1b2c3d4-0000-4000-8000-000000000002";
const OTHER = "b0000000-0000-4000-8000-000000000003";
const V2 = "5f1b0000-0000-4000-8000-000000000002";
const BYTES = '{"@context":{"airo":"https://w3id.org/airo#"},"@graph":[]}';

const access = { role: "viewer" as string | null };
const card = { current: { id: "c2", projectId: PROJECT, systemId: V2 } as Record<string, string> | null };
const deliver = vi.fn(async () => ({ document: BYTES, fromStore: false }));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/services/callerToken", () => ({ callerToken: async () => "caller-tok" }));
vi.mock("@/server/access/projectAccess", async (orig) => ({
  ...((await orig()) as object),
  fetchAccess: vi.fn(async () => ({ role: access.role, admin: false, may_write: false })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    qualification: {
      findUnique: vi.fn(async () => card.current),
      findFirst: vi.fn(async () => card.current),
    },
  },
}));
vi.mock("@/server/services/KnowledgeGraphStore", () => ({
  KnowledgeGraphStore: class {},
  knowledgeGraphStore: { deliver },
  stampOf: () => [],
}));
vi.mock("@/server/services/OntologyService", () => ({
  OntologyService: class {},
  ontologyService: { build: vi.fn(async () => ({})) },
}));

const get = async (project: string, systemPid: string) => {
  const { GET } = await load(ROUTE);
  return GET(new Request(`http://q/p/${project}/api/system-versions/${systemPid}/ontology.jsonld`), {
    params: Promise.resolve({ project, systemPid }),
  }) as Promise<Response>;
};

beforeEach(() => {
  access.role = "viewer";
  card.current = { id: "c2", projectId: PROJECT, systemId: V2 };
  deliver.mockClear();
  deliver.mockImplementation(async () => ({ document: BYTES, fromStore: false }));
});

describe("GET /p/{project}/api/system-versions/{systemPid}/ontology.jsonld", () => {
  it("S7.3 the route file exists", () => {
    expect(existsSync(ROUTE_FILE)).toBe(true);
  });

  it("S7.5 a member gets the card's JSON-LD, the very bytes the store delivers", async () => {
    const res = await get(PROJECT, V2);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(BYTES);
    expect(res.headers.get("content-type")).toMatch(/application\/ld\+json/);
    expect(deliver).toHaveBeenCalledWith("c2", "jsonld", expect.any(Function));
  });

  it("S7.3 a non-member gets 404", async () => {
    access.role = null;
    const res = await get(PROJECT, V2);
    expect(res.status).toBe(404);
    expect(deliver).not.toHaveBeenCalled();
  });

  it("S7.3 a version whose card belongs to another project is 404", async () => {
    card.current = { id: "c9", projectId: OTHER, systemId: V2 };
    const res = await get(PROJECT, V2);
    expect(res.status).toBe(404);
    expect(deliver).not.toHaveBeenCalled();
  });

  it("S7.3 a version with no card is 404 (control objectives turns it into 409)", async () => {
    card.current = null;
    const res = await get(PROJECT, V2);
    expect(res.status).toBe(404);
  });

  it("S7.3 the builder being down is 502", async () => {
    deliver.mockImplementation(async () => {
      throw new Error("ontology service unreachable");
    });
    const res = await get(PROJECT, V2);
    expect(res.status).toBe(502);
  });
});
