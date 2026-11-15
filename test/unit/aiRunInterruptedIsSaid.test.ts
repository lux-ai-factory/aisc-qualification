import { describe, it, expect, vi, beforeEach } from "vitest";

// The AI run state lives in the agents service. When that service no longer knows a
// run (it restarted) or answers with an error, the fill route says the state is
// unknown, not "idle": "idle" reads as "nothing happened", so the card could not tell
// an interrupted run apart from no run at all.

const PID = "aaaaaaaa-0000-4000-8000-00000000000a";

vi.mock("@/lib/projectDb", () => ({
  projectDbForRoute: async () => ({}),
  callerAccess: async () => ({ ok: true, pid: PID, slug: PID, role: "editor", admin: false, mayWrite: true }),
}));
vi.mock("@/server/repositories/QualificationRepository", () => ({
  QualificationRepository: class {
    cardSummary = async () => ({ id: "q1" });
  },
}));

async function stateWhenAgentsAnswer(status: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ detail: "no such run" }), { status })),
  );
  const { GET } = await import("@/app/p/[project]/api/qualifications/[id]/fill/route");
  const res = await GET(new Request(`http://q/p/${PID}/api/qualifications/q1/fill`), {
    params: Promise.resolve({ project: PID, id: "q1" }),
  });
  return (await res.json()) as { state: string };
}

beforeEach(() => {
  vi.stubEnv("AGENT_SERVICE_URL", "http://agents.test");
});

describe("the fill route when the agents service does not know the run", () => {
  it("a run the agents service no longer knows is unknown, not idle", async () => {
    expect((await stateWhenAgentsAnswer(404)).state).toBe("unknown");
  });

  it("an agents service that answers with an error is unknown, not idle", async () => {
    expect((await stateWhenAgentsAnswer(500)).state).toBe("unknown");
  });
});
