// A failed fill run's error text (already short and cleaned by the agent) is for the
// people who can act on it: editors and owners, as control-objectives shows a mapping run's
// error (may_read_errors). A viewer sees that the run failed and nothing more.
import { describe, it, expect, vi, beforeEach } from "vitest";

const PID = "aaaaaaaa-0000-4000-8000-00000000000a";
const access = vi.hoisted(() => ({ value: null as unknown }));

vi.mock("@/lib/projectDb", () => ({
  projectDbForRoute: async () => ({}),
  callerAccess: async () => access.value,
}));
vi.mock("@/server/repositories/QualificationRepository", () => ({
  QualificationRepository: class {
    cardSummary = async () => ({ id: "q1" });
  },
}));

const FAILED = { state: "failed", run: 3, error: "provider answered 401: invalid key" };

async function status(role: string, mayWrite: boolean) {
  access.value = { ok: true, pid: PID, slug: PID, role, admin: false, mayWrite };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(FAILED), { status: 200 })),
  );
  const { GET } = await import("@/app/p/[project]/api/qualifications/[id]/fill/route");
  const res = await GET(new Request(`http://q/p/${PID}/api/qualifications/q1/fill`), {
    params: Promise.resolve({ project: PID, id: "q1" }),
  });
  return res.json();
}

beforeEach(() => {
  vi.stubEnv("AGENT_SERVICE_URL", "http://agents.test");
});

describe("a failed run's error text in the fill status", () => {
  it("an editor gets the cleaned error", async () => {
    expect(await status("editor", true)).toEqual(FAILED);
  });

  it("a viewer gets the state and the run, not the error", async () => {
    const body = await status("viewer", false);
    expect(body).toEqual({ state: "failed", run: 3 });
  });

  it("when the platform does not say who is asking, the error is left out", async () => {
    access.value = { ok: false, status: 503, message: "Who may be here cannot be established just now." };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(FAILED), { status: 200 })),
    );
    const { GET } = await import("@/app/p/[project]/api/qualifications/[id]/fill/route");
    const res = await GET(new Request(`http://q/p/${PID}/api/qualifications/q1/fill`), {
      params: Promise.resolve({ project: PID, id: "q1" }),
    });
    expect(await res.json()).toEqual({ state: "failed", run: 3 });
  });
});
