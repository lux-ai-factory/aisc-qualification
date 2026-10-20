// Another service's error text reached the person as it was. The
// ontology 502 bodies and the card page echoed the builder's whole error body, the platform's
// response body went into the save action's error, and the PDF route answered with the renderer's
// internal URL and the network error behind it. The person is a project member and the services
// are internal, so this is a tidy-up: what is shown is now one line, at most SHOWN_DETAIL
// characters, and the renderer's address and cause are no longer part of the message.
import { describe, expect, it, vi } from "vitest";

import { SHOWN_DETAIL, shortDetail } from "@/server/services/errorText";
import { OntologyClient } from "@/server/services/OntologyClient";
import { PlatformClient } from "@/server/services/PlatformClient";
import {
  RendererHttpError,
  RendererUnreachableError,
} from "@/server/services/SystemCardRendererClient";

const TRACEBACK = `Traceback (most recent call last):\n${'  File "/app/airo_min/build.py", line 12, in build\n'.repeat(200)}KeyError: 'x'`;

describe("shortDetail", () => {
  it("keeps a short message as it is", () => {
    expect(shortDetail("Only an editor may save a card version.")).toBe(
      "Only an editor may save a card version.",
    );
  });

  it("makes a long, multi-line body one line of at most SHOWN_DETAIL characters", () => {
    const out = shortDetail(TRACEBACK);
    expect(out).not.toContain("\n");
    expect(out.length).toBeLessThanOrEqual(SHOWN_DETAIL);
  });
});

describe("the clients shorten what a service answered", () => {
  it("the ontology builder's 500 body", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(TRACEBACK, { status: 500 }));
    const err = await new OntologyClient("http://ontology:8011", fetchImpl)
      .build({} as never)
      .catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/^Ontology service error 500: /);
    expect((err as Error).message).not.toContain("\n");
    expect((err as Error).message.length).toBeLessThanOrEqual(
      SHOWN_DETAIL + 40,
    );
  });

  it("the platform's error body: its detail, short", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "x".repeat(5000) }), {
        status: 400,
      }),
    );
    const err = await new PlatformClient("http://platform:8000", fetchImpl)
      .createVersion("p1", { name: "MCAS" })
      .catch((e: Error) => e);
    const message = (err as Error).message;
    expect(message).toMatch(
      /^Could not name this system: the platform answered 400\. x+/,
    );
    expect(message).not.toContain('{"detail"');
    expect(message.length).toBeLessThanOrEqual(SHOWN_DETAIL + 70);
  });

  it("the renderer: no internal address or network error in the message", () => {
    const err = new RendererUnreachableError(
      "http://qualification-pdf:8005",
      new Error("connect ECONNREFUSED 172.18.0.9:8005"),
    );
    expect(err.message).not.toContain("qualification-pdf");
    expect(err.message).not.toContain("172.18.0.9");
    expect(err.message).toMatch(/renderer/i);
  });

  it("the renderer's error body, short", () => {
    const err = new RendererHttpError(500, TRACEBACK);
    expect(err.message).not.toContain("\n");
    expect(err.message.length).toBeLessThanOrEqual(SHOWN_DETAIL + 40);
  });
});
