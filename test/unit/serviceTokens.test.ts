import { describe, it, expect, vi, afterEach } from "vitest";

// API auth WP2 (2026-09-25), inventory findings 8 and 11. The sidecars this app
// calls (agents, ontology, prefill, pdf) now refuse a caller without a token.
// Each edge has its own: this app sends the one for the service it calls, in
// X-AISC-Service-Token, and never another service's.

const HEADER = "X-AISC-Service-Token";
// Split so the credential scanner (secrets.test.ts) does not read them as real ones.
const tok = (edge: string) => ["web", "to", edge, "test", "value"].join("-");

function fakeFetch(body: unknown = {}, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new ArrayBuffer(1),
  } as unknown as Response);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const headersOf = (fetchImpl: any, call = 0): Record<string, string> =>
  (fetchImpl.mock.calls[call][1]?.headers ?? {}) as Record<string, string>;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("the shared header helper", () => {
  it("names the header and sends nothing without a token", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const http: any = await import("@/server/services/http");
    expect(http.SERVICE_TOKEN_HEADER).toBe(HEADER);
    expect(http.serviceTokenHeaders("abc")).toEqual({ [HEADER]: "abc" });
    expect(http.serviceTokenHeaders("")).toEqual({});
    expect(http.serviceTokenHeaders(undefined)).toEqual({});
  });
});

// Runs are addressed by project and card (isolation Q1: /fill/{pid}/{id}).
const PID = "a1b2c3d4-0000-4000-8000-000000000002";

describe("qualification-agents", () => {
  it("the save's POST /fill carries the web-to-agents token", async () => {
    vi.stubEnv("QUALIFICATION_WEB_TO_AGENTS_TOKEN", tok("agents"));
    const fetchImpl = fakeFetch();
    const { FillerClient } = await import("@/server/services/FillerClient");
    await new FillerClient("http://agents:8012", fetchImpl as unknown as typeof fetch).request(PID, "q1");
    expect(headersOf(fetchImpl)[HEADER]).toBe(tok("agents"));
  });

  it("the card's GET /fill proxy carries it too", async () => {
    vi.stubEnv("QUALIFICATION_WEB_TO_AGENTS_TOKEN", tok("agents"));
    vi.stubEnv("AGENT_SERVICE_URL", "http://agents:8012");
    // isolation Q1: the door lets the caller read the project, and the card is in its database
    vi.doMock("@/lib/projectDb", () => ({ projectDbForRoute: async () => ({}) }));
    vi.doMock("@/server/repositories/QualificationRepository", () => ({
      QualificationRepository: class {
        cardSummary = async (id: string) => ({ id });
      },
    }));
    const fetchImpl = fakeFetch({ state: "done" });
    vi.stubGlobal("fetch", fetchImpl);
    const { GET } = await import("@/app/p/[project]/api/qualifications/[id]/fill/route");
    const res = await GET(new Request("http://q/x"), { params: Promise.resolve({ project: PID, id: "q1" }) });
    expect(res.status).toBe(200);
    expect(fetchImpl.mock.calls[0][0]).toBe(`http://agents:8012/fill/${PID}/q1`);
    expect(headersOf(fetchImpl)[HEADER]).toBe(tok("agents"));
    vi.doUnmock("@/lib/projectDb");
    vi.doUnmock("@/server/repositories/QualificationRepository");
  });
});

describe("qualification-ontology", () => {
  it("build and vocabularies carry the web-to-ontology token", async () => {
    vi.stubEnv("ONTOLOGY_SERVICE_URL", "http://ontology:8011");
    vi.stubEnv("QUALIFICATION_WEB_TO_ONTOLOGY_TOKEN", tok("ontology"));
    const fetchImpl = fakeFetch({});
    vi.stubGlobal("fetch", fetchImpl);
    const { OntologyClient } = await import("@/server/services/OntologyClient");
    const client = OntologyClient.fromEnv();
    await client.build({ systemName: "x" } as never);
    await client.vocabularies();
    expect(headersOf(fetchImpl, 0)[HEADER]).toBe(tok("ontology"));
    expect(headersOf(fetchImpl, 0)["content-type"]).toBe("application/json");
    expect(headersOf(fetchImpl, 1)[HEADER]).toBe(tok("ontology"));
  });
});

describe("qualification-prefill", () => {
  it("POST /prefill carries the web-to-prefill token", async () => {
    vi.stubEnv("QUALIFICATION_WEB_TO_PREFILL_TOKEN", tok("prefill"));
    const fetchImpl = fakeFetch({ values: {}, filled: [], kept: [], model: null });
    const { PrefillClient } = await import("@/server/services/PrefillClient");
    await new PrefillClient("http://prefill:8012", fetchImpl as unknown as typeof fetch).read(
      new File(["x"], "a.txt"),
    );
    expect(headersOf(fetchImpl)[HEADER]).toBe(tok("prefill"));
  });

  it("the form reader's POST /forms/import carries it too", async () => {
    vi.stubEnv("QUALIFICATION_WEB_TO_PREFILL_TOKEN", tok("prefill"));
    const fetchImpl = fakeFetch({ format: "csv", found: 0, questions: [], warnings: [] });
    const { FormImportClient } = await import("@/server/services/FormImportClient");
    await new FormImportClient("http://prefill:8012", fetchImpl as unknown as typeof fetch).read(
      new File(["question\nWho?\n"], "a.csv"),
    );
    expect(fetchImpl.mock.calls[0][0]).toBe("http://prefill:8012/forms/import");
    expect(headersOf(fetchImpl)[HEADER]).toBe(tok("prefill"));
  });

  it("the form writer's POST /forms/export carries it too, beside its JSON content type", async () => {
    vi.stubEnv("QUALIFICATION_WEB_TO_PREFILL_TOKEN", tok("prefill"));
    const fetchImpl = fakeFetch({ filename: "f.csv", contentType: "text/csv", content: "" });
    const { FormExportClient } = await import("@/server/services/FormExportClient");
    await new FormExportClient("http://prefill:8012", fetchImpl as unknown as typeof fetch).write(
      { formName: "F", versionNumber: 1, questions: [] } as never,
      "csv",
    );
    expect(fetchImpl.mock.calls[0][0]).toBe("http://prefill:8012/forms/export");
    expect(headersOf(fetchImpl)[HEADER]).toBe(tok("prefill"));
    expect(headersOf(fetchImpl)["Content-Type"]).toBe("application/json");
  });
});

describe("qualification-pdf", () => {
  it("POST /render/pdf carries the web-to-pdf token", async () => {
    vi.stubEnv("QUALIFICATION_WEB_TO_PDF_TOKEN", tok("pdf"));
    const fetchImpl = fakeFetch();
    vi.stubGlobal("fetch", fetchImpl);
    const { SystemCardRendererClient } = await import("@/server/services/SystemCardRendererClient");
    await new SystemCardRendererClient("http://pdf:8005").renderPdf({});
    expect(headersOf(fetchImpl)[HEADER]).toBe(tok("pdf"));
    expect(headersOf(fetchImpl)["Content-Type"]).toBe("application/json");
  });
});

describe("no client sends another edge's token", () => {
  it("each env name is read by its own client only", async () => {
    const { readFileSync } = await import("node:fs");
    const read = (p: string) => readFileSync(p, "utf8");
    const owners: Record<string, string[]> = {
      QUALIFICATION_WEB_TO_AGENTS_TOKEN: [
        "src/server/services/FillerClient.ts",
        "src/app/p/[project]/api/qualifications/[id]/fill/route.ts",
      ],
      QUALIFICATION_WEB_TO_ONTOLOGY_TOKEN: ["src/server/services/OntologyClient.ts"],
      QUALIFICATION_WEB_TO_PREFILL_TOKEN: [
        "src/server/services/PrefillClient.ts",
        "src/server/services/FormImportClient.ts",
        "src/server/services/FormExportClient.ts",
      ],
      QUALIFICATION_WEB_TO_PDF_TOKEN: ["src/server/services/SystemCardRendererClient.ts"],
    };
    const files = Object.values(owners).flat();
    for (const [name, mine] of Object.entries(owners)) {
      for (const file of files) {
        expect(read(file).includes(name), `${file} and ${name}`).toBe(mine.includes(file));
      }
    }
  });
});

describe("every caller of a sidecar sends that sidecar's token", () => {
  // A new client of one of these services that forgets the token gets 401 in
  // the stack and nothing in a unit test, so this looks for it by the URL it reads.
  const TOKEN_OF: Record<string, string> = {
    AGENT_SERVICE_URL: "QUALIFICATION_WEB_TO_AGENTS_TOKEN",
    ONTOLOGY_SERVICE_URL: "QUALIFICATION_WEB_TO_ONTOLOGY_TOKEN",
    PREFILL_URL: "QUALIFICATION_WEB_TO_PREFILL_TOKEN",
    SYSTEM_CARD_RENDERER_URL: "QUALIFICATION_WEB_TO_PDF_TOKEN",
    LLM_SERVICE_URL: "QUALIFICATION_WEB_TO_LLM_TOKEN",
  };

  it("holds for every source file that reads a sidecar's URL", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const missing: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name)) {
          const text = readFileSync(path, "utf8");
          for (const [url, token] of Object.entries(TOKEN_OF)) {
            if (text.includes(`process.env.${url}`) && !(text.includes(token) && text.includes("serviceTokenHeaders")))
              missing.push(`${path} reads ${url} but does not send ${token}`);
          }
        }
      }
    };
    walk("src");
    expect(missing).toEqual([]);
  });
});
