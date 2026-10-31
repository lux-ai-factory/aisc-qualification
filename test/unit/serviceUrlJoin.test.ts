import { afterEach, describe, expect, it, vi } from "vitest";

import { OntologyClient } from "@/server/services/OntologyClient";
import {
  RendererHttpError,
  RendererUnreachableError,
  SystemCardRendererClient,
} from "@/server/services/SystemCardRendererClient";

// Every client joins its configured base URL and the path with serviceUrl (http.ts), so a
// base written with a trailing slash still reaches the route: the ontology service answers
// 404 for //vocabularies.


afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a base URL with a trailing slash", () => {
  it("the ontology client builds and reads the vocabularies at single-slash paths", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith("/build")
        ? new Response(JSON.stringify({ view: {}, turtle: "", jsonld: "", problems: [] }), { status: 200 })
        : new Response(JSON.stringify({}), { status: 200 }),
    );
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

describe("the renderer client on a slow or odd answer", () => {
  it("gives the render up after a while", async () => {
    const fetchImpl = vi.fn(async () => new Response("%PDF", { status: 200 }));
    vi.stubGlobal("fetch", fetchImpl);
    await new SystemCardRendererClient("http://qualification-pdf:8005", "t").renderPdf({});
    expect(((fetchImpl.mock.calls[0] as unknown[])[1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  it("a refusal keeps its status and the renderer's detail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "no card" }), { status: 422 })));
    const err = await new SystemCardRendererClient("http://pdf:8005", "t").renderPdf({}).catch((e: Error) => e);
    expect(err).toBeInstanceOf(RendererHttpError);
    expect((err as RendererHttpError).status).toBe(422);
    expect((err as Error).message).toBe("Renderer returned HTTP 422: no card");
  });

  it("no answer is RendererUnreachableError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    const err = await new SystemCardRendererClient("http://pdf:8005", "t").renderPdf({}).catch((e: Error) => e);
    expect(err).toBeInstanceOf(RendererUnreachableError);
  });
});
