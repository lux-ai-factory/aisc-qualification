import { describe, it, expect, vi, afterEach } from "vitest";
import { auditEvent } from "@/lib/audit";

describe("qualification auditEvent (server-side forwarder)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("POSTs to backend /audit with Bearer token and app=qualification", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    await auditEvent({ token: "tok", what: "qualification:create", consequence: { qualificationId: "q1" } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/v1/audit");
    expect(init.headers.Authorization).toBe("Bearer tok");
    const body = JSON.parse(init.body);
    expect(body.what).toBe("qualification:create");
    expect(body.app).toBe("qualification");
    expect(body.consequence).toEqual({ qualificationId: "q1" });
  });

  it("no token -> no call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await auditEvent({ token: null, what: "x:y" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws on backend failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    await expect(auditEvent({ token: "t", what: "x:y" })).resolves.toBeUndefined();
  });
});
