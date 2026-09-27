import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadSrc, setVersion, setQuestion, annexSetLiteral } from "../support/forms";

// Two-level forms (docs/superpowers/two-level-forms-2026-09-25/01-spec.md), T47:
// GET /p/<project>/question-sets/<setId>/export?format=csv|md[&version=<n>] is 06 R57's contract
// (formExportRoute.test.ts, deleted, carried here unchanged in substance) on a question set:
// the version comes from questionSetService.atNumber(setId, n?) (the latest when n is absent),
// and FormExportClient.write gets a plain list {name: set name, version: set version number,
// questions: {text, citation, required, annexPoint}[]}. Builtin and retired sets export too.
//
// Names chosen here: the route uses the module singletons `questionSetService`
// (src/server/services/QuestionSetService.ts) and `formExportClient`
// (src/server/services/FormExportClient.ts).

const ROUTE = "app/p/[project]/question-sets/[setId]/export/route.ts";

const { questionSetService, formExportClient } = vi.hoisted(() => ({
  questionSetService: { atNumber: vi.fn() },
  formExportClient: { write: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/QuestionSetService", () => ({ QuestionSetService: class {}, questionSetService }));
vi.mock("@/server/services/FormExportClient", () => ({ FormExportClient: class {}, formExportClient }));

const acme = setVersion({
  setId: "acme",
  setName: "Acme AI policy",
  versionId: "acme-v3",
  versionNumber: 3,
  questions: [
    setQuestion("acme", "q2", { text: "Who signs off?", citation: "§4.2", required: true, annexPoint: "2a" as never, groupLabel: "Sign-off" }),
    setQuestion("acme", "q1", { text: "How are incidents reported?", citation: "", required: false }),
  ],
});
const acmeList = {
  name: "Acme AI policy",
  version: 3,
  questions: [
    { text: "Who signs off?", citation: "§4.2", required: true, annexPoint: "2a" },
    { text: "How are incidents reported?", citation: "", required: false, annexPoint: null },
  ],
};
const CSV = "﻿question,citation,required,annex_point\r\nWho signs off?,§4.2,yes,2a\r\n";

async function get(query: string, setId = "acme", project = "demo") {
  const { GET } = await loadSrc(ROUTE);
  return (await GET(new Request(`http://q/p/${project}/question-sets/${encodeURIComponent(setId)}/export${query}`), {
    params: Promise.resolve({ project, setId }),
  })) as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  questionSetService.atNumber.mockResolvedValue(acme);
  formExportClient.write.mockResolvedValue({
    ok: true,
    filename: "acme-ai-policy-v3.csv",
    contentType: "text/csv; charset=utf-8",
    content: CSV,
  });
});

describe("the question-set export route (T47, 06 R57)", () => {
  it("T47 a 200 is the content's UTF-8 bytes exactly, BOM included, with the three headers", async () => {
    const res = await get("?format=csv&version=3");
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new TextEncoder().encode(CSV));
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="acme-ai-policy-v3.csv"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(questionSetService.atNumber).toHaveBeenCalledWith("acme", 3);
  });

  it("T47 the client gets the set's name, version number and questions as a plain list, in order", async () => {
    await get("?format=md&version=3");
    expect(formExportClient.write).toHaveBeenCalledWith(acmeList, "md");
  });

  it("T47 without a version it asks for the latest", async () => {
    await get("?format=md");
    expect(questionSetService.atNumber).toHaveBeenCalledTimes(1);
    expect(questionSetService.atNumber.mock.calls[0][0]).toBe("acme");
    expect(questionSetService.atNumber.mock.calls[0][1]).toBeUndefined();
    expect(formExportClient.write.mock.calls[0][1]).toBe("md");
  });

  it.each(["", "?version=3", "?format=pdf", "?format=CSV", "?format=json", "?format=docx&version=1"])(
    "T47 format missing or not csv/md (%s) is 400 format must be csv or md",
    async (query) => {
      const res = await get(query);
      expect(res.status).toBe(400);
      expect(await res.text()).toBe("format must be csv or md");
      expect(formExportClient.write).not.toHaveBeenCalled();
    },
  );

  it.each(["0", "-1", "1.5", "abc", "3x"])("T47 a version that is not a positive integer (%s) is 404 Not found", async (v) => {
    const res = await get(`?format=csv&version=${v}`);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
    expect(formExportClient.write).not.toHaveBeenCalled();
  });

  it("T47 an unknown set, or a number it does not have, is 404 Not found", async () => {
    questionSetService.atNumber.mockResolvedValue(null);
    for (const query of ["?format=csv", "?format=md&version=9"]) {
      const res = await get(query, "nope");
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("Not found");
    }
    expect(formExportClient.write).not.toHaveBeenCalled();
  });

  it.each([
    [503, "Exporting forms is not available on this install."],
    [502, "The form writer could not be reached."],
    [502, "The form could not be exported."],
  ])("T47 the client's failure is its status (%i) and its error as the body", async (status, error) => {
    formExportClient.write.mockResolvedValue({ ok: false, status, error });
    const res = await get("?format=csv");
    expect(res.status).toBe(status);
    expect(await res.text()).toBe(error);
  });

  it("T47 the builtin set Annex IV v1 exports, as the list named Annex IV version 1", async () => {
    questionSetService.atNumber.mockResolvedValue(annexSetLiteral());
    const res = await get("?format=csv&version=1", "annex-iv");
    expect(res.status).toBe(200);
    const [list] = formExportClient.write.mock.calls[0];
    expect(list.name).toBe("Annex IV");
    expect(list.version).toBe(1);
    expect(list.questions).toHaveLength(14);
    expect(Object.keys(list.questions[0]).sort()).toEqual(["annexPoint", "citation", "required", "text"]);
  });

  it("T47 a retired set exports like any other", async () => {
    const retired = setVersion({ ...acme, retired: true });
    questionSetService.atNumber.mockResolvedValue(retired);
    const res = await get("?format=csv&version=3");
    expect(res.status).toBe(200);
    expect(formExportClient.write).toHaveBeenCalledWith(acmeList, "csv");
  });

  it("T47 the route is GET only", async () => {
    const mod = await loadSrc(ROUTE);
    expect(typeof mod.GET).toBe("function");
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) expect(mod[m]).toBeUndefined();
  });
});
