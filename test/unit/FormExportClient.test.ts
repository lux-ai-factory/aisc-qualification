import { describe, it, expect, vi } from "vitest";
import { resolve } from "node:path";

// Addendum 06, R56: FormExportClient carries a form version to the prefill
// service's POST /forms/export and the file back. Like FormImportClient it
// never throws.
//
// Interface (addendum): new FormExportClient(baseUrl = PREFILL_URL ?? "", fetchImpl = fetch)
//   .write(list: {name, version, questions}, format: "csv" | "md")   (two-level forms 5.3; was a ResolvedFormVersion)
//   -> { ok: true, filename, contentType, content } | { ok: false, status: 502 | 503, error }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = async (): Promise<any> =>
  (await import(/* @vite-ignore */ resolve("src/server/services/FormExportClient.ts"))).FormExportClient;

// Two-level forms (01-spec 5.3, 8.3): write takes a plain question list, {name, version,
// questions: {text, citation, required, annexPoint}[]}, so a question-set version and a
// flattened questionnaire version are written alike. Everything else is R56 unchanged.
const form = {
  name: "Acme AI policy",
  version: 3,
  questions: [
    { text: "Who signs off | approves?", citation: "", required: true, annexPoint: "2a" },
    { text: "How are incidents reported?", citation: "Acme §7", required: false, annexPoint: null },
  ],
};

const written = { filename: "acme-ai-policy-v3.md", contentType: "text/markdown; charset=utf-8", content: "# Acme AI policy (v3)\n" };
const ok = (body: unknown) => vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });

describe("FormExportClient (R56)", () => {
  it("R56 T47 posts the format and the list's name, version and questions in order to /forms/export", async () => {
    const FormExportClient = await load();
    const fetchImpl = ok(written);
    const result = await new FormExportClient("http://qualification-prefill:8012", fetchImpl).write(form, "md");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://qualification-prefill:8012/forms/export");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toMatch(/^application\/json/);
    expect(JSON.parse(init.body)).toEqual({
      format: "md",
      form: {
        name: "Acme AI policy",
        version: 3,
        questions: [
          { text: "Who signs off | approves?", citation: "", required: true, annexPoint: "2a" },
          { text: "How are incidents reported?", citation: "Acme §7", required: false, annexPoint: null },
        ],
      },
    });
    expect(result).toEqual({ ok: true, ...written });
  });

  it("R56 without PREFILL_URL it says so with 503, and calls nothing", async () => {
    const FormExportClient = await load();
    const fetchImpl = vi.fn();
    expect(await new FormExportClient("", fetchImpl).write(form, "csv")).toEqual({
      ok: false,
      status: 503,
      error: "Exporting forms is not available on this install.",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("R56 reads PREFILL_URL when no base URL is given", async () => {
    const FormExportClient = await load();
    const before = process.env.PREFILL_URL;
    delete process.env.PREFILL_URL;
    try {
      const fetchImpl = vi.fn();
      expect((await new FormExportClient(undefined, fetchImpl).write(form, "csv")).status).toBe(503);
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      if (before !== undefined) process.env.PREFILL_URL = before;
    }
  });

  it("R56 a fetch that throws is 502 The form writer could not be reached.", async () => {
    const FormExportClient = await load();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await new FormExportClient("http://x", fetchImpl).write(form, "csv")).toEqual({
      ok: false,
      status: 502,
      error: "The form writer could not be reached.",
    });
  });

  it.each([
    ["a 422", { ok: false, status: 422, json: async () => ({ detail: "format must be csv or md" }) }],
    ["a 500", { ok: false, status: 500, json: async () => ({}) }],
    ["a 200 that is not JSON", { ok: true, status: 200, json: async () => { throw new Error("not json"); } }],
    ["a 200 missing a key", { ok: true, status: 200, json: async () => ({ filename: "f.csv", content: "x" }) }],
    ["a 200 with a key that is not a string", { ok: true, status: 200, json: async () => ({ ...written, content: 7 }) }],
  ])("R56 %s is 502 The form could not be exported.", async (_label, response) => {
    const FormExportClient = await load();
    const fetchImpl = vi.fn().mockResolvedValue(response);
    expect(await new FormExportClient("http://x", fetchImpl).write(form, "csv")).toEqual({
      ok: false,
      status: 502,
      error: "The form could not be exported.",
    });
  });
});
