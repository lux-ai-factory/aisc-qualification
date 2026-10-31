import { afterEach, describe, expect, it, vi } from "vitest";

import { OntologyClient } from "@/server/services/OntologyClient";
import { SystemCardRendererClient } from "@/server/services/SystemCardRendererClient";

// Every client joins its configured base URL and the path with serviceUrl (http.ts), so a
// base written with a trailing slash still reaches the route: the ontology service answers
// 404 for //vocabularies.

const ok = (body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a base URL with a trailing slash", () => {
  it("the ontology client builds and reads the vocabularies at single-slash paths", async () => {
    const fetchImpl = ok({});
    const client = new OntologyClient("http://ontology:8011/", fetchImpl as unknown as typeof fetch);
    await client.vocabularies();
    await client.build({} as never);
    const urls = fetchImpl.mock.calls.map((c) => (c as unknown[])[0]);
    expect(urls).toEqual(["http://ontology:8011/vocabularies", "http://ontology:8011/build"]);
  });

  it("the renderer client posts to a single-slash path", async () => {
    const fetchImpl = vi.fn(async () => new Response("%PDF", { status: 200 }));
    vi.stubGlobal("fetch", fetchImpl);
    await new SystemCardRendererClient("http://qualification-pdf:8005/", "t").renderPdf({});
    expect((fetchImpl.mock.calls[0] as unknown[])[0]).toBe("http://qualification-pdf:8005/render/pdf");
  });
});
