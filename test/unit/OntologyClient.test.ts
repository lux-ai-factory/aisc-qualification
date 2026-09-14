import { describe, it, expect, vi } from "vitest";
import { OntologyClient } from "@/server/services/OntologyClient";
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

  it("fromEnv refuses to run unconfigured", () => {
    const saved = process.env.ONTOLOGY_SERVICE_URL;
    delete process.env.ONTOLOGY_SERVICE_URL;
    expect(() => OntologyClient.fromEnv()).toThrow(/ONTOLOGY_SERVICE_URL/);
    if (saved) process.env.ONTOLOGY_SERVICE_URL = saved;
  });
});
