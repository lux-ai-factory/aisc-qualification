import { describe, it, expect, vi, afterEach } from "vitest";
import { loadSrc } from "../support/forms";

// QuestionnaireFileClient carries a questionnaire to the prefill service's
// POST /questionnaires/export and the file back, and a questionnaire file to
// POST /questionnaires/import and the normalised document back. Like FormImportClient and
// FormExportClient it never throws and sends this app's service token.
//
// Interface:
//   new QuestionnaireFileClient(baseUrl = PREFILL_URL ?? "", fetchImpl = fetch,
//                               serviceToken = QUALIFICATION_WEB_TO_PREFILL_TOKEN ?? "")
//   .write(file: QuestionnaireFileInput, bundle: "references" | "self-contained")
//      -> { ok: true, filename, contentType, content } | { ok: false, status, error }
//   .read(file: File) -> { ok: true, file: QuestionnaireFile } | { ok: false, status, error }
//   singleton `questionnaireFileClient`.

const load = async () =>
  (await loadSrc("server/services/QuestionnaireFileClient.ts")) as {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    QuestionnaireFileClient: any;
    questionnaireFileClient: unknown;
  };

const HEADER = "X-AISC-Service-Token";

const input = {
  name: "Annex IV default",
  description: "EU AI Act Annex IV points 1 and 2, as 14 questions.",
  version: 1,
  blocks: ["risks"],
  items: [
    {
      setId: "annex-iv",
      setName: "Annex IV",
      setVersion: 1,
      scope: "annex-1",
      localId: "1a",
      text: "If this version replaces an earlier one, describe what changed and why.",
      citation: "Annex IV(1)(a)",
      required: true,
      annexPoint: "1a",
      groupLabel: "About the system",
    },
  ],
};

const written = {
  filename: "annex-iv-default-v1.questionnaire.json",
  contentType: "application/json; charset=utf-8",
  content: '{\n  "format": "aisc-questionnaire"\n}\n',
};

const normalised = {
  format: "aisc-questionnaire",
  formatVersion: 1,
  bundle: "references",
  name: "Annex IV default",
  description: "",
  version: 1,
  blocks: ["risks"],
  items: [{ setId: "annex-iv", setName: "Annex IV", setVersion: 1, scope: "annex-1", localId: "1a" }],
};

const ok = (body: unknown) => vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });
const jsonFile = () => new File(['{"format":"aisc-questionnaire"}'], "q.questionnaire.json", { type: "application/json" });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("QuestionnaireFileClient.write (T48, T54)", () => {
  it("T54 posts {bundle, questionnaire} as JSON to /questionnaires/export, with the service token, and returns the file", async () => {
    const { QuestionnaireFileClient } = await load();
    const fetchImpl = ok(written);
    const result = await new QuestionnaireFileClient("http://qualification-prefill:8012/", fetchImpl, "tok-p").write(
      input,
      "self-contained",
    );
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://qualification-prefill:8012/questionnaires/export");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("content-type")).toMatch(/^application\/json/);
    expect(headers.get(HEADER)).toBe("tok-p");
    expect(JSON.parse(init.body)).toEqual({ bundle: "self-contained", questionnaire: input });
    expect(result).toEqual({ ok: true, ...written });
  });

  it("T54 the references bundle travels as given", async () => {
    const { QuestionnaireFileClient } = await load();
    const fetchImpl = ok(written);
    await new QuestionnaireFileClient("http://x", fetchImpl, "t").write(input, "references");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).bundle).toBe("references");
  });

  it("T54 without PREFILL_URL it is 503 Questionnaire files are not available on this install., and calls nothing", async () => {
    const { QuestionnaireFileClient } = await load();
    const fetchImpl = vi.fn();
    expect(await new QuestionnaireFileClient("", fetchImpl).write(input, "references")).toEqual({
      ok: false,
      status: 503,
      error: "Questionnaire files are not available on this install.",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("T54 reads PREFILL_URL and the token from the environment when not given", async () => {
    vi.stubEnv("PREFILL_URL", "http://env-prefill:8012");
    vi.stubEnv("QUALIFICATION_WEB_TO_PREFILL_TOKEN", "env-token");
    const { QuestionnaireFileClient } = await load();
    const fetchImpl = ok(written);
    await new QuestionnaireFileClient(undefined, fetchImpl).write(input, "references");
    expect(fetchImpl.mock.calls[0][0]).toBe("http://env-prefill:8012/questionnaires/export");
    expect(new Headers(fetchImpl.mock.calls[0][1].headers).get(HEADER)).toBe("env-token");
  });

  it("T54 a fetch that throws is 502 The questionnaire file service could not be reached.", async () => {
    const { QuestionnaireFileClient } = await load();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await new QuestionnaireFileClient("http://x", fetchImpl).write(input, "references")).toEqual({
      ok: false,
      status: 502,
      error: "The questionnaire file service could not be reached.",
    });
  });

  it("T54 a 4xx passes the service's detail on, with its status", async () => {
    const { QuestionnaireFileClient } = await load();
    const detail =
      "item 1 has no wording: a self-contained file needs text, citation, required, annexPoint and groupLabel";
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ detail }) });
    expect(await new QuestionnaireFileClient("http://x", fetchImpl).write(input, "self-contained")).toEqual({
      ok: false,
      status: 422,
      error: detail,
    });
  });

  it("T54 an answer it cannot read is a 502, never a throw", async () => {
    const { QuestionnaireFileClient } = await load();
    for (const response of [
      { ok: false, status: 500, json: async () => ({}) },
      { ok: true, status: 200, json: async () => { throw new Error("not json"); } },
      { ok: true, status: 200, json: async () => ({ filename: "f.json", content: "x" }) },
    ]) {
      const fetchImpl = vi.fn().mockResolvedValue(response);
      const out = await new QuestionnaireFileClient("http://x", fetchImpl).write(input, "references");
      expect(out.ok).toBe(false);
      expect(out.status).toBe(502);
      expect(typeof out.error).toBe("string");
    }
  });
});

describe("QuestionnaireFileClient.read (T53, T54)", () => {
  it("T53 posts the file as multipart field `file` to /questionnaires/import, with the token, and returns the document", async () => {
    const { QuestionnaireFileClient } = await load();
    const fetchImpl = ok(normalised);
    const result = await new QuestionnaireFileClient("http://qualification-prefill:8012", fetchImpl, "tok-p").read(
      jsonFile(),
    );
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://qualification-prefill:8012/questionnaires/import");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
    expect(new Headers(init.headers).get(HEADER)).toBe("tok-p");
    expect(result).toEqual({ ok: true, file: normalised });
  });

  it("T54 without PREFILL_URL it is 503, and calls nothing", async () => {
    const { QuestionnaireFileClient } = await load();
    const fetchImpl = vi.fn();
    expect(await new QuestionnaireFileClient("", fetchImpl).read(jsonFile())).toEqual({
      ok: false,
      status: 503,
      error: "Questionnaire files are not available on this install.",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("T54 a fetch that throws is 502", async () => {
    const { QuestionnaireFileClient } = await load();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await new QuestionnaireFileClient("http://x", fetchImpl).read(jsonFile())).toEqual({
      ok: false,
      status: 502,
      error: "The questionnaire file service could not be reached.",
    });
  });

  it.each([
    [422, "this is not a questionnaire file: format must be aisc-questionnaire, formatVersion 1"],
    [422, ".csv is not a questionnaire file format: json"],
    [413, "the file is too large"],
  ])("T51 T54 a %i passes the detail on: %s", async (status, detail) => {
    const { QuestionnaireFileClient } = await load();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({ detail }) });
    expect(await new QuestionnaireFileClient("http://x", fetchImpl).read(jsonFile())).toEqual({
      ok: false,
      status,
      error: detail,
    });
  });

  it("T54 there is a module singleton questionnaireFileClient", async () => {
    const mod = await load();
    expect(mod.questionnaireFileClient).toBeInstanceOf(mod.QuestionnaireFileClient);
  });
});
