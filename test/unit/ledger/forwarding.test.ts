// The witnessed request travels to the platform and to the agent,
// with the run; author fields never reach an event; a server action's re-render is no page view.
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => state.headers }));

import {
  eventBody,
  isServerAction,
  withoutAuthors,
} from "@/vendor/aisc-ledger/emit";
import { FillerClient } from "@/server/services/FillerClient";
import { PlatformClient } from "@/server/services/PlatformClient";

const REQUEST = "a5a5a5a5-0000-4000-8000-000000000001";
// local work: no gateway token to verify, so the presented request id is cited as it is
// (requestIdThroughGateway.test.ts checks who may set it with auth on)
process.env.AUTH_ENABLED = "false";
const RUN = "b5b5b5b5-0000-4000-8000-000000000001";

afterEach(() => {
  state.headers = new Headers();
});

function recorder() {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(
      JSON.stringify({ pid: "p", number: 1, project_id: "x" }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe("the witnessed request travels on", () => {
  it("to the platform, so its card_version.created cites the person's request", async () => {
    state.headers = new Headers({ "x-aisc-request-id": REQUEST });
    const { calls, fetchImpl } = recorder();
    await new PlatformClient("http://platform", fetchImpl).createVersion("p1", {
      name: "MCAS",
      version: "1",
    } as never);
    expect(new Headers(calls[0].init.headers).get("x-aisc-request-id")).toBe(
      REQUEST,
    );
  });

  it("and nothing is invented outside a request", async () => {
    const { calls, fetchImpl } = recorder();
    await new PlatformClient("http://platform", fetchImpl).createVersion("p1", {
      name: "MCAS",
      version: "1",
    } as never);
    expect(new Headers(calls[0].init.headers).has("x-aisc-request-id")).toBe(
      false,
    );
  });

  it("to the agent, with the run it opened", async () => {
    const { calls, fetchImpl } = recorder();
    await new FillerClient("http://agents", fetchImpl, "t").request(
      "p1",
      "q1",
      { runId: RUN, requestId: REQUEST },
    );
    const sent = new Headers(calls[0].init.headers);
    expect([sent.get("x-aisc-run-id"), sent.get("x-aisc-request-id")]).toEqual([
      RUN,
      REQUEST,
    ]);
  });
});

describe("an event never names who acted", () => {
  it("drops author fields at any depth", () => {
    expect(
      withoutAuthors({
        set: { name: "A", createdBy: "ada@x" },
        versions: [{ createdBy: "ada@x", n: 1 }],
      }),
    ).toEqual({ set: { name: "A" }, versions: [{ n: 1 }] });
    const body = JSON.parse(
      eventBody(
        {
          action: "question_set.created",
          itemType: "question_set",
          itemId: "s1",
          content: { set: { createdBy: "ada@x" } },
        },
        null,
      ),
    );
    expect(JSON.stringify(body)).not.toContain("ada@x");
  });

  it("keeps what JSON keeps: an undefined field is dropped, not refused", () => {
    expect(() =>
      eventBody(
        {
          action: "a",
          itemType: "t",
          itemId: "1",
          content: { a: 1, b: undefined },
        },
        null,
      ),
    ).not.toThrow();
  });
});

describe("a server action's re-render is no page view", () => {
  it("knows a server action's POST by its Next-Action header", async () => {
    state.headers = new Headers({ "next-action": "7f01" });
    expect(await isServerAction()).toBe(true);
    state.headers = new Headers();
    expect(await isServerAction()).toBe(false);
  });

  // the card page records an opening only outside a server action: cardOpenedEvent.test.ts
});

// qualification.opened names the card version opened, not the provider's
// version text. Checked on a render of the page in cardOpenedEvent.test.ts.
