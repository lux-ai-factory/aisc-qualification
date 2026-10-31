import { describe, it, expect, vi } from "vitest";
import { OntologyClient, OntologyRejected } from "@/server/services/OntologyClient";
import type { OntologyView } from "@/domain/OntologyView";

const view: OntologyView = {
  system: {
    id: "system",
    label: "MCAS v1.2.0",
    cls: "AISystem",
    vair: null,
    fullText: null,
    provenance: "form",
  },
  answers: [],
  rows: [],
  chains: [],
  counts: {
    nodes: 59,
    triples: 376,
    risks: 5,
    reviewed: 0,
    untyped: 42,
    flagged: 0,
    needsTerm: 42,
    unclassifiable: 0,
  },
};

function fakeFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response);
}

const qualification = { systemName: "MCAS", systemVersion: "v1.2.0" } as never;

describe("OntologyClient", () => {
  it("posts the qualification and returns the view", async () => {
    const fetchMock = fakeFetch(200, {
      view,
      turtle: "@prefix airo: <x> .",
      jsonld: "{}",
      problems: [],
    });
    const client = new OntologyClient("http://ontology:8010", fetchMock);
    const result = await client.build(qualification);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://ontology:8010/build");
    expect(JSON.parse(init.body).qualification.systemName).toBe("MCAS");
    expect(result.view.counts.risks).toBe(5);
    expect(result.turtle).toContain("@prefix");
  });

  it("sends the extraction and the patch when given them", async () => {
    const fetchMock = fakeFetch(200, {
      view,
      turtle: "",
      jsonld: "",
      problems: [],
    });
    const client = new OntologyClient("http://ontology:8010", fetchMock);
    await client.build(
      qualification,
      { techniques: [] },
      { purpose: { label: "x" } },
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.extracted).toEqual({ techniques: [] });
    expect(body.patch).toEqual({ purpose: { label: "x" } });
  });

  it("surfaces the service's own message on a rejected patch", async () => {
    const fetchMock = fakeFetch(422, {
      detail: "'Telepathy' is not a term VAIR defines",
    });
    const client = new OntologyClient("http://ontology:8010", fetchMock);
    await expect(client.build(qualification)).rejects.toThrow(
      /Telepathy.*not a term VAIR defines/,
    );
  });

  it("reports a service failure with its status", async () => {
    const fetchMock = fakeFetch(500, { detail: "boom" });
    const client = new OntologyClient("http://ontology:8010", fetchMock);
    await expect(client.build(qualification)).rejects.toThrow(/500/);
  });

  it("a plain-text error body (a proxy's page) is not shown: the status is", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response("Internal Server Error from the proxy", { status: 500 }),
      );
    const client = new OntologyClient("http://ontology:8010", fetchMock);
    await expect(client.build(qualification)).rejects.toThrow(/^Ontology service error 500$/);
  });

  it("fromEnv refuses to run unconfigured", () => {
    const saved = process.env.ONTOLOGY_SERVICE_URL;
    delete process.env.ONTOLOGY_SERVICE_URL;
    expect(() => OntologyClient.fromEnv()).toThrow(/ONTOLOGY_SERVICE_URL/);
    if (saved) process.env.ONTOLOGY_SERVICE_URL = saved;
  });
});

describe("OntologyClient on an answer it cannot use", () => {
  it("both calls are given up after a while", async () => {
    const fetchMock = fakeFetch(200, { view, turtle: "", jsonld: "", problems: [], digest: "d" });
    const client = new OntologyClient("http://ontology:8010", fetchMock);
    await client.build(qualification);
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ Purpose: ["x"] }) } as never);
    await client.vocabularies();
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(fetchMock.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("a 2xx without a view is an error, not a build", async () => {
    const client = new OntologyClient("http://ontology:8010", fakeFetch(200, { turtle: "" }));
    await expect(client.build(qualification)).rejects.toThrow(/could not read/);
  });

  it("vocabularies that are not lists of terms are an error", async () => {
    const client = new OntologyClient("http://ontology:8010", fakeFetch(200, { Purpose: "x" }));
    await expect(client.vocabularies()).rejects.toThrow(/could not read/);
  });

  it("a service that does not answer is an error, not an OntologyRejected", async () => {
    const client = new OntologyClient("http://ontology:8010", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const err = await client.build(qualification).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(OntologyRejected);
    expect((err as Error).message).toBe("Ontology service error: the service could not be reached");
  });
});
