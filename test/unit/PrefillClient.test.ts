import { describe, it, expect, vi } from "vitest";
import { PrefillClient } from "@/server/services/PrefillClient";

// Upload the document you already wrote and the form opens with its answers in
// place. The reading is done by the prefill service, in Python; this carries
// the file there and the answers back, and says plainly when it could not.
describe("PrefillClient", () => {
  const ok = {
    read: true,
    source: "document",
    model: null,
    values: { systemName: "MCAS" },
    filled: ["systemName"],
    kept: [],
    proposed: ["systemName"],
  };

  function fileNamed(name = "doc.txt") {
    return new File([new Uint8Array([104, 105])], name, { type: "text/plain" });
  }

  it("sends the file, the mode and what the form already holds", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ok });
    const client = new PrefillClient("http://qualification-prefill:8012", fetchImpl);

    const result = await client.read(fileNamed(), "replace", { systemName: "Mine" });

    expect(result.ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://qualification-prefill:8012/prefill");
    expect(init.method).toBe("POST");
    const sent = init.body as FormData;
    expect(sent.get("mode")).toBe("replace");
    expect(JSON.parse(sent.get("current") as string)).toEqual({ systemName: "Mine" });
    expect(sent.get("file")).toBeInstanceOf(File);
  });

  it("sends the risk rows the form holds, and brings the document's back", async () => {
    const row = { risk: "wrongly refused", source: "", vulnerability: "", consequence: "", affected: "user", areas: ["right"], control: "", followUpControl: "" };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...ok, risks: [row], risksKept: false, risksProposed: 1 }),
    });
    const result = await new PrefillClient("http://x", fetchImpl).read(fileNamed(), "empty", {}, [
      { ...row, risk: "typed" },
    ]);
    const sent = fetchImpl.mock.calls[0][1].body as FormData;
    expect(JSON.parse(sent.get("current_risks") as string)[0].risk).toBe("typed");
    expect(result).toMatchObject({ ok: true, risks: [row], risksKept: false, risksProposed: 1 });
  });

  it("reads a service that knows nothing about risks as having none", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ok });
    const result = await new PrefillClient("http://x", fetchImpl).read(fileNamed());
    expect(result).toMatchObject({ ok: true, risks: null, risksKept: false, risksProposed: 0 });
  });

  it("defaults to the careful mode", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ok });
    await new PrefillClient("http://x", fetchImpl).read(fileNamed());
    expect((fetchImpl.mock.calls[0][1].body as FormData).get("mode")).toBe("empty");
  });

  it("passes on what the service said was wrong", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: "exe is not a format this reads: docx, md, pdf, txt" }),
    });

    const result = await new PrefillClient("http://x", fetchImpl).read(fileNamed("a.exe"));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not a format/);
  });

  it("says so when the service is not there rather than throwing", async () => {
    // The form still has to open, and the person can still type.
    const fetchImpl = vi.fn().mockRejectedValue(new Error("no route to host"));
    const result = await new PrefillClient("http://x", fetchImpl).read(fileNamed());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/could not be reached|not available/i);
  });

  it("says so when no prefill service is configured", async () => {
    const fetchImpl = vi.fn();
    const result = await new PrefillClient("", fetchImpl).read(fileNamed());
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// ── Form assembly: the prefill is told which form it is filling ────────────
// (spec docs/superpowers/form-assembly-2026-09-24/01-spec.md, R38, R40)
//
// read(file, mode, current, currentRisks, formSpec?) with
// formSpec = { fields: string[], questions: {field, text, citation, annexPoint}[] }.

describe("PrefillClient with a form (R38, R40)", () => {
  const ok = { values: {}, filled: [], kept: [], model: null };
  const file = () => new File([new Uint8Array([104, 105])], "doc.md", { type: "text/markdown" });

  it("R40 sends the form's fields and questions as JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ok });
    const spec = {
      fields: ["systemName", "systemVersion", "company", "q:f-x:q1"],
      questions: [{ field: "q:f-x:q1", text: "Who signs off?", citation: "Acme AI Policy §4.2", annexPoint: null }],
    };
    await new PrefillClient("http://x", fetchImpl).read(file(), "empty", {}, [], spec);
    const sent = fetchImpl.mock.calls[0][1].body as FormData;
    expect(JSON.parse(sent.get("fields") as string)).toEqual(spec.fields);
    expect(JSON.parse(sent.get("questions") as string)).toEqual(spec.questions);
  });

  it("T58 a set question pinned to its v1 is sent with the v1 wording under q:s-acme:q1", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ok });
    const spec = {
      fields: ["systemName", "systemVersion", "company", "q:annex-2:2a", "q:s-acme:q1"],
      questions: [
        { field: "q:annex-2:2a", text: "How was the system built, step by step?", citation: "Annex IV(2)(a)", annexPoint: "2a" },
        { field: "q:s-acme:q1", text: "Who signs off a model release?", citation: "Acme AI Policy §4.2", annexPoint: null },
      ],
    };
    await new PrefillClient("http://x", fetchImpl).read(file(), "empty", {}, [], spec);
    const sent = fetchImpl.mock.calls[0][1].body as FormData;
    expect(JSON.parse(sent.get("fields") as string)).toEqual(spec.fields);
    expect(JSON.parse(sent.get("questions") as string)).toEqual(spec.questions);
  });

  it("R38 without a form it sends exactly what it sends today", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ok });
    await new PrefillClient("http://x", fetchImpl).read(file(), "empty", {}, []);
    const sent = fetchImpl.mock.calls[0][1].body as FormData;
    expect([...sent.keys()].sort()).toEqual(["current", "current_risks", "file", "mode"]);
  });
});
