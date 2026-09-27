import { describe, it, expect, vi } from "vitest";
import { FormImportClient } from "@/server/services/FormImportClient";

// Carries a form file to the prefill service's POST /forms/import and the
// questions back. Like PrefillClient it never throws: a service that is down
// or not deployed means the person builds the form by hand
// (form-assembly spec R28, section 5.3).
//
// Interface: new FormImportClient(baseUrl = PREFILL_URL, fetchImpl = fetch).read(file)

const file = (name = "acme.csv") =>
  new File(["question,citation\nWho signs off?,§4.2\n"], name, { type: "text/csv" });

const body = {
  format: "csv",
  found: 1,
  questions: [{ text: "Who signs off?", citation: "§4.2", required: false }],
  warnings: ["Removed 1 duplicate question."],
};

describe("FormImportClient (R28)", () => {
  it("R28 posts the file to /forms/import and returns the questions, warnings and count", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });
    const result = await new FormImportClient("http://qualification-prefill:8012", fetchImpl).read(file());
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://qualification-prefill:8012/forms/import");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
    expect(result).toMatchObject({
      ok: true,
      found: 1,
      questions: [{ text: "Who signs off?", citation: "§4.2", required: false }],
      warnings: ["Removed 1 duplicate question."],
    });
  });

  it("R28 says so when no prefill service is configured, without calling anything", async () => {
    const fetchImpl = vi.fn();
    expect(await new FormImportClient("", fetchImpl).read(file())).toEqual({
      ok: false,
      error: "Importing forms is not available on this install.",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("R28 says so when the service cannot be reached, rather than throwing", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await new FormImportClient("http://x", fetchImpl).read(file())).toEqual({
      ok: false,
      error: "The form reader could not be reached.",
    });
  });

  it("R28 passes on the service's reason for a file it refused", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: "pdf is not a form format this reads: csv, docx, md" }),
    });
    expect(await new FormImportClient("http://x", fetchImpl).read(file("policy.pdf"))).toEqual({
      ok: false,
      error: "pdf is not a form format this reads: csv, docx, md",
    });
  });

  it("R28 a refusal with no reason still says something, e.g. a file too large", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 413,
      json: async () => {
        throw new Error("not json");
      },
    });
    const result = await new FormImportClient("http://x", fetchImpl).read(file());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/413/);
  });

  it("R28 reads PREFILL_URL when no base URL is given", async () => {
    const before = process.env.PREFILL_URL;
    delete process.env.PREFILL_URL;
    try {
      const fetchImpl = vi.fn();
      const result = await new FormImportClient(undefined, fetchImpl).read(file());
      expect(result).toEqual({ ok: false, error: "Importing forms is not available on this install." });
    } finally {
      if (before !== undefined) process.env.PREFILL_URL = before;
    }
  });
});

// ── Addendum 06: the Annex tag travels (R59) ───────────────────────────────

describe("FormImportClient carries each question's Annex IV point (R59)", () => {
  it("R59 annexPoint is kept when it is one of the 14, and null for anything else or when missing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        format: "csv",
        found: 5,
        questions: [
          { text: "One?", citation: "", required: true, annexPoint: "2a" },
          { text: "Two?", citation: "", required: false, annexPoint: null },
          { text: "Three?", citation: "", required: false, annexPoint: "3z" },
          { text: "Four?", citation: "", required: false, annexPoint: "Annex IV(2)(a)" },
          { text: "Five?", citation: "", required: false },
        ],
        warnings: [],
      }),
    });
    const result = await new FormImportClient("http://x", fetchImpl).read(file());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.questions.map((q) => (q as { annexPoint?: unknown }).annexPoint)).toEqual([
        "2a",
        null,
        null,
        null,
        null,
      ]);
      expect(result.questions[0]).toEqual({ text: "One?", citation: "", required: true, annexPoint: "2a" });
    }
  });
});
