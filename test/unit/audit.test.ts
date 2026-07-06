import { describe, it, expect, vi, afterEach } from "vitest";
import { auditEvent } from "@/lib/audit";

describe("qualification auditEvent (server-side forwarder)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("POSTs to backend /audit with Bearer token, action/resource_type and source_app=qualification", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    await auditEvent({
      token: "tok", action: "create", resource_type: "qualification",
      resource_id: "q1", metadata: { note: "x" },
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/v1/audit");
    expect(init.headers.Authorization).toBe("Bearer tok");
    const body = JSON.parse(init.body);
    expect(body.action).toBe("create");
    expect(body.resource_type).toBe("qualification");
    expect(body.resource_id).toBe("q1");
    expect(body.source_app).toBe("qualification");
    expect(body.metadata).toEqual({ note: "x" });
    expect(body.outcome).toBe("ok");
  });

  it("no token -> no call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await auditEvent({ token: null, action: "create", resource_type: "qualification" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws on backend failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    await expect(
      auditEvent({ token: "t", action: "x", resource_type: "y" }),
    ).resolves.toBeUndefined();
  });
});
