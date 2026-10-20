// The pages under /p/{pid} ask the read door themselves.
//
// In Next 15 a page is not rendered inside its layout: the layout gets a placeholder, and the
// page's own tree is rendered beside it, at the same time. So the layout's check could not
// stop a page from reading or writing, and an RSC request that names the layout segment as
// already held skips the layout altogether. projectDbPastDoor, which every page opens its
// database with, now asks the platform itself, once per request however many components ask;
// a caller let through by the agent's service token is not asked again.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => state.headers }));
class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("NEXT_NOT_FOUND");
  },
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
}));
const ledger = vi.hoisted(() => ({ emitEvent: vi.fn(async () => null) }));
vi.mock("@/vendor/aisc-ledger/emit", async (orig) => ({
  ...(await orig<typeof import("@/vendor/aisc-ledger/emit")>()),
  emitEvent: ledger.emitEvent,
  isServerAction: async () => false,
}));

import {
  projectDbFor,
  projectDbForService,
  projectDbPastDoor,
  projectDatabaseUrl,
} from "@/lib/projectDb";
import { authzAnswer } from "../support/isolation";

const PROJECT = "a1b2c3d4-0000-4000-8000-000000000002";
const TEMPLATE = "postgresql://u:p@127.0.0.1:1/{database}?schema=qualification";

// A database client that records every use: the door must refuse before it is touched.
const touched: string[] = [];
const client = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === "then") return undefined; // not a promise
      touched.push(String(prop));
      return new Proxy(() => Promise.resolve(null), {
        get: (_f, p) => {
          touched.push(`${String(prop)}.${String(p)}`);
          return async () => null;
        },
      });
    },
  },
);

const authz = vi.fn();
const platformSays = (role: string | null) =>
  authz.mockImplementation(async (url: string) => {
    const access = { role, admin: false, may_write: role === "editor" };
    return new Response(JSON.stringify(authzAnswer(access, url)), { status: 200 });
  });

beforeEach(() => {
  vi.clearAllMocks();
  touched.length = 0;
  state.headers = new Headers({ authorization: "Bearer person" }); // a new request
  vi.stubEnv("PLATFORM_URL", "http://platform:8000");
  vi.stubEnv("PROJECT_DATABASE_URL", TEMPLATE);
  vi.stubGlobal("fetch", authz);
  // the project's database is "open" already, so no test reaches Postgres
  const open = (
    globalThis as unknown as {
      qualificationProjectDatabases?: Map<string, unknown>;
    }
  ).qualificationProjectDatabases;
  open?.set(projectDatabaseUrl(PROJECT), {
    client,
    ready: Promise.resolve(),
  });
});

describe("a page past a bypassed middleware", () => {
  it("the card page, for a stranger, reads nothing and records no qualification.opened", async () => {
    platformSays(null);
    const Page = (await import("@/app/p/[project]/qualify/[id]/page")).default;
    await expect(
      Page({ params: Promise.resolve({ project: PROJECT, id: "c1" }) }),
    ).rejects.toBeInstanceOf(NotFound);
    expect(authz).toHaveBeenCalled();
    expect(String(authz.mock.calls[0][0])).toContain(
      `/authz/projects/${PROJECT}`,
    );
    expect(touched).toEqual([]);
    expect(ledger.emitEvent).not.toHaveBeenCalled();
  }, 30_000); // the page module is large to transform on a loaded run
});

describe("projectDbPastDoor asks the read door once per request", () => {
  it("the layout's door and every component's projectDbPastDoor make one /authz call", async () => {
    platformSays("viewer");
    await projectDbFor(PROJECT, { write: false });
    await Promise.all([
      projectDbPastDoor(PROJECT),
      projectDbPastDoor(PROJECT),
      projectDbPastDoor(PROJECT),
    ]);
    expect(authz).toHaveBeenCalledTimes(1);
  });

  it("a new request asks again", async () => {
    platformSays("viewer");
    await projectDbPastDoor(PROJECT);
    state.headers = new Headers({ authorization: "Bearer person" });
    await projectDbPastDoor(PROJECT);
    expect(authz).toHaveBeenCalledTimes(2);
  });

  it("the agent, let through by its service token, is not asked again (it is nobody to the platform)", async () => {
    platformSays(null);
    state.headers = new Headers({ "x-aisc-service-token": "t" });
    await projectDbForService(PROJECT);
    await expect(projectDbPastDoor(PROJECT)).resolves.toBe(client);
    expect(authz).not.toHaveBeenCalled();
  });
});
