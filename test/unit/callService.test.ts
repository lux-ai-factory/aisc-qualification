import { describe, it, expect, vi } from "vitest";

// One call to a sibling service: callService({base, path, method, project, token, body, timeoutMs,
// parse}) answers {ok: true, value} or {ok: false, status, shownDetail}, and never throws. `status`
// is null when no answer came; `shownDetail` is the service's reason as one short string, or null
// when it gave none. Under test: src/server/services/http.ts.

const load = async (): Promise<any> => import("@/server/services/http");

type Init = { method?: string; headers: Record<string, string>; body?: unknown; signal?: AbortSignal };
const answer = (status: number, json: () => Promise<unknown>) => ({ ok: status < 300, status, json });
const isNumber = (raw: unknown) => (typeof raw === "number" ? raw : undefined);

describe("callService", () => {
  it("joins the URL, sends the project and the service token, and gives the parsed value", async () => {
    const { callService } = await load();
    const fetchImpl = vi.fn(async () => answer(200, async () => 7));
    const got = await callService({
      base: "http://svc:8012//",
      path: "/things",
      method: "POST",
      project: "p-1",
      token: "tok",
      body: { a: 1 },
      parse: isNumber,
      fetchImpl,
    });
    expect(got).toEqual({ ok: true, value: 7 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, Init];
    expect(url).toBe("http://svc:8012/things");
    expect(init.method).toBe("POST");
    expect(init.headers["X-AISC-Project"]).toBe("p-1");
    expect(init.headers["X-AISC-Service-Token"]).toBe("tok");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends FormData as it is, and no header it was given nothing for", async () => {
    const { callService } = await load();
    const fetchImpl = vi.fn(async () => answer(200, async () => 1));
    const form = new FormData();
    form.set("file", new File(["x"], "x.txt"));
    await callService({ base: "http://svc", path: "/in", method: "POST", body: form, parse: isNumber, fetchImpl });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, Init];
    expect(init.body).toBe(form);
    expect(init.headers).toEqual({});
  });

  it("a service that does not answer in time is given up: no status", async () => {
    const { callService } = await load();
    const fetchImpl = vi.fn(
      (_url: string, init: Init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const got = await callService({ base: "http://svc", path: "/slow", timeoutMs: 20, parse: isNumber, fetchImpl });
    expect(got.ok).toBe(false);
    expect(got.status).toBeNull();
    expect(got.shownDetail).toMatch(/did not answer/);
  });

  it("a service that cannot be reached: no status", async () => {
    const { callService } = await load();
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const got = await callService({ base: "http://svc", path: "/x", parse: isNumber, fetchImpl });
    expect(got).toEqual({ ok: false, status: null, shownDetail: "the service could not be reached" });
  });

  it("a 2xx that is not JSON is not a value", async () => {
    const { callService } = await load();
    const fetchImpl = vi.fn(async () =>
      answer(200, async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      }),
    );
    const got = await callService({ base: "http://svc", path: "/x", parse: isNumber, fetchImpl });
    expect(got).toEqual({ ok: false, status: 200, shownDetail: "the service gave an answer this could not read" });
  });

  it("a 2xx of the wrong shape is not a value", async () => {
    const { callService } = await load();
    const fetchImpl = vi.fn(async () => answer(200, async () => ({ not: "a number" })));
    const got = await callService({ base: "http://svc", path: "/x", parse: isNumber, fetchImpl });
    expect(got).toEqual({ ok: false, status: 200, shownDetail: "the service gave an answer this could not read" });
  });

  it("FastAPI's list-shaped detail is shown as one string", async () => {
    const { callService } = await load();
    const detail = [
      { loc: ["body", "file"], msg: "Field required", type: "missing" },
      { loc: ["body", "mode"], msg: "Input should be 'empty' or 'replace'", type: "literal_error" },
    ];
    const fetchImpl = vi.fn(async () => answer(422, async () => ({ detail })));
    const got = await callService({ base: "http://svc", path: "/x", parse: isNumber, fetchImpl });
    expect(got).toEqual({
      ok: false,
      status: 422,
      shownDetail: "file: Field required; mode: Input should be 'empty' or 'replace'",
    });
  });

  it("a string detail is passed on, a long one cut short", async () => {
    const { callService } = await load();
    const fetchImpl = vi.fn(async () => answer(413, async () => ({ detail: "x".repeat(1000) })));
    const got = await callService({ base: "http://svc", path: "/x", parse: isNumber, fetchImpl });
    expect(got.status).toBe(413);
    expect(got.shownDetail.length).toBeLessThanOrEqual(300);
  });

  it("a refusal with no reason has no detail, only its status", async () => {
    const { callService } = await load();
    const fetchImpl = vi.fn(async () =>
      answer(502, async () => {
        throw new SyntaxError("not json");
      }),
    );
    const got = await callService({ base: "http://svc", path: "/x", parse: isNumber, fetchImpl });
    expect(got).toEqual({ ok: false, status: 502, shownDetail: null });
  });
});
