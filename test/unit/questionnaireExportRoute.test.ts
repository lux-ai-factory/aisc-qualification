import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loadSrc,
  formVersion,
  setQuestion,
  seededQuestion,
  defaultVersionLiteral,
} from "../support/forms";

// GET /p/<project>/questionnaires/<id>/export?format=json|csv|md[&bundle=self-contained][&version=<n>]
//   json    -> QuestionnaireFileClient.write(<the version as a file input>, bundle ?? "references")
//   csv/md  -> FormExportClient.write({name: questionnaire name, version: its number, questions}), the
//              questionnaire's resolved questions flattened into a form file
// An unknown id or version is 404 Not found. Unlisted, retired and builtin questionnaires export too.
//
// The module singletons used: `questionnaireService`
// (src/server/services/QuestionnaireService.ts, method exportable(id, n?)),
// `questionnaireFileClient` (src/server/services/QuestionnaireFileClient.ts) and
// `formExportClient` (src/server/services/FormExportClient.ts).

const ROUTE =
  "app/p/[project]/questionnaires/[questionnaireId]/export/route.ts";

const { questionnaireService, questionnaireFileClient, formExportClient } =
  vi.hoisted(() => ({
    questionnaireService: { exportable: vi.fn() },
    questionnaireFileClient: { write: vi.fn() },
    formExportClient: { write: vi.fn() },
  }));
// The project doors let these calls through: which project's database a forms page, action or
// route opens, and who may, is pinned by isolationForms.test.ts.
vi.mock("@/lib/projectDb", () => ({
  projectDbPastDoor: async () => ({}),
  projectDbForAction: async () => ({ db: {} }),
  projectDbForRoute: async () => ({}),
}));
vi.mock("@/server/services/QuestionnaireService", () => ({
  QuestionnaireService: class {},
  questionnaireService,
  questionnairesOn: () => questionnaireService,
  questionnairesFor: async () => questionnaireService,
}));
vi.mock("@/server/services/QuestionnaireFileClient", () => ({
  QuestionnaireFileClient: class {},
  questionnaireFileClient,
}));
vi.mock("@/server/services/FormExportClient", () => ({
  FormExportClient: class {},
  formExportClient,
}));

const mix = formVersion({
  questionnaireId: "mix",
  questionnaireName: "Acme mix",
  description: "Policy plus two Annex points.",
  versionId: "mix-v2",
  versionNumber: 2,
  blocks: ["description", "risks"] as never,
  questions: [
    seededQuestion("2a"),
    setQuestion("acme", "q1", {
      text: "Who signs off a model release?",
      citation: "Acme AI Policy §4.2",
      required: false,
      setName: "Acme AI policy",
      setVersionId: "acme-v3",
      setVersionNumber: 3,
    }),
  ],
});

const mixInput = {
  name: "Acme mix",
  description: "Policy plus two Annex points.",
  version: 2,
  blocks: ["description", "risks"],
  items: [
    {
      setId: "annex-iv",
      setName: "Annex IV",
      setVersion: 1,
      scope: "annex-2",
      localId: "2a",
      text: seededQuestion("2a").text,
      citation: "Annex IV(2)(a)",
      required: true,
      annexPoint: "2a",
      groupLabel: "How the system was built",
    },
    {
      setId: "acme",
      setName: "Acme AI policy",
      setVersion: 3,
      scope: "s-acme",
      localId: "q1",
      text: "Who signs off a model release?",
      citation: "Acme AI Policy §4.2",
      required: false,
      annexPoint: null,
      groupLabel: null,
    },
  ],
};

const mixList = {
  name: "Acme mix",
  version: 2,
  questions: [
    {
      text: seededQuestion("2a").text,
      citation: "Annex IV(2)(a)",
      required: true,
      annexPoint: "2a",
    },
    {
      text: "Who signs off a model release?",
      citation: "Acme AI Policy §4.2",
      required: false,
      annexPoint: null,
    },
  ],
};

const JSON_FILE = {
  ok: true,
  filename: "acme-mix-v2.questionnaire.json",
  contentType: "application/json; charset=utf-8",
  content: '{\n  "format": "aisc-questionnaire"\n}\n',
};
const CSV = "﻿question,citation,required,annex_point\r\n";

async function get(query: string, questionnaireId = "mix", project = "demo") {
  const { GET } = await loadSrc(ROUTE);
  return (await GET(
    new Request(
      `http://q/p/${project}/questionnaires/${encodeURIComponent(questionnaireId)}/export${query}`,
    ),
    { params: Promise.resolve({ project, questionnaireId }) },
  )) as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  questionnaireService.exportable.mockResolvedValue(mix);
  questionnaireFileClient.write.mockResolvedValue(JSON_FILE);
  formExportClient.write.mockResolvedValue({
    ok: true,
    filename: "acme-mix-v2.csv",
    contentType: "text/csv; charset=utf-8",
    content: CSV,
  });
});

describe("the questionnaire export route: the questionnaire file (T48)", () => {
  it("T48 format=json writes the version as T50's input with bundle references by default, 200 with the bytes and headers", async () => {
    const res = await get("?format=json&version=2");
    expect(res.status).toBe(200);
    expect(questionnaireService.exportable).toHaveBeenCalledWith("mix", 2);
    expect(questionnaireFileClient.write).toHaveBeenCalledWith(
      mixInput,
      "references",
    );
    expect(formExportClient.write).not.toHaveBeenCalled();
    expect(await res.text()).toBe(JSON_FILE.content);
    expect(res.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="acme-mix-v2.questionnaire.json"',
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("T48 bundle=self-contained travels to the client", async () => {
    await get("?format=json&bundle=self-contained");
    expect(questionnaireFileClient.write).toHaveBeenCalledWith(
      mixInput,
      "self-contained",
    );
  });

  it("T48 without a version it asks for the latest", async () => {
    await get("?format=json");
    expect(questionnaireService.exportable.mock.calls[0][0]).toBe("mix");
    expect(questionnaireService.exportable.mock.calls[0][1]).toBeUndefined();
  });

  it("T48 the Annex IV default's file input: the builtin questionnaire exports, 14 items of set annex-iv v1", async () => {
    questionnaireService.exportable.mockResolvedValue(defaultVersionLiteral());
    const res = await get("?format=json&version=1", "annex-iv-default");
    expect(res.status).toBe(200);
    const [q] = questionnaireFileClient.write.mock.calls[0];
    expect(q).toMatchObject({
      name: "Annex IV default",
      description: "EU AI Act Annex IV points 1 and 2, as 14 questions.",
      version: 1,
    });
    expect(q.blocks).toHaveLength(9);
    expect(q.items).toHaveLength(14);
    expect(q.items[0]).toEqual({
      setId: "annex-iv",
      setName: "Annex IV",
      setVersion: 1,
      scope: "annex-1",
      localId: "1a",
      text: seededQuestion("1a").text,
      citation: "Annex IV(1)(a)",
      required: true,
      annexPoint: "1a",
      groupLabel: "About the system",
    });
  });

  it.each([
    [
      "unlisted (use once)",
      {
        listed: false,
        questionnaireName: "Custom questions: MCAS, 2026-09-25",
      },
    ],
    ["retired", { retired: true }],
  ])("T48 a %s questionnaire exports like any other", async (_label, over) => {
    questionnaireService.exportable.mockResolvedValue(
      formVersion({ ...mix, ...over }),
    );
    const res = await get("?format=json&version=2");
    expect(res.status).toBe(200);
    expect(questionnaireFileClient.write).toHaveBeenCalledTimes(1);
  });
});

describe("the questionnaire export route: flattened CSV and Markdown (T48, D23)", () => {
  it.each(["csv", "md"] as const)(
    "T48 format=%s writes the resolved questions as one list named after the questionnaire",
    async (format) => {
      const res = await get(`?format=${format}&version=2`);
      expect(res.status).toBe(200);
      expect(formExportClient.write).toHaveBeenCalledWith(mixList, format);
      expect(questionnaireFileClient.write).not.toHaveBeenCalled();
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(
        new TextEncoder().encode(CSV),
      );
      expect(res.headers.get("content-disposition")).toBe(
        'attachment; filename="acme-mix-v2.csv"',
      );
      expect(res.headers.get("cache-control")).toBe("no-store");
    },
  );
});

describe("the questionnaire export route: refusals (T48)", () => {
  it.each([
    "",
    "?version=2",
    "?format=pdf",
    "?format=JSON",
    "?format=docx&version=1",
    "?bundle=self-contained",
  ])(
    "T48 format missing or not json/csv/md (%s) is 400 format must be json, csv or md",
    async (query) => {
      const res = await get(query);
      expect(res.status).toBe(400);
      expect(await res.text()).toBe("format must be json, csv or md");
      expect(questionnaireFileClient.write).not.toHaveBeenCalled();
      expect(formExportClient.write).not.toHaveBeenCalled();
    },
  );

  it.each([
    "?format=json&bundle=references",
    "?format=json&bundle=",
    "?format=json&bundle=all",
    "?format=csv&bundle=self-contained",
    "?format=md&bundle=self-contained",
  ])(
    "T48 %s is 400 bundle applies to json only, and is self-contained",
    async (query) => {
      const res = await get(query);
      expect(res.status).toBe(400);
      expect(await res.text()).toBe(
        "bundle applies to json only, and is self-contained",
      );
      expect(questionnaireFileClient.write).not.toHaveBeenCalled();
      expect(formExportClient.write).not.toHaveBeenCalled();
    },
  );

  it.each(["0", "-1", "1.5", "abc", "2x"])(
    "T48 a version that is not a positive integer (%s) is 404 Not found",
    async (v) => {
      const res = await get(`?format=json&version=${v}`);
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("Not found");
      expect(questionnaireFileClient.write).not.toHaveBeenCalled();
    },
  );

  it("T48 an unknown questionnaire, or a number it does not have, is 404 Not found", async () => {
    questionnaireService.exportable.mockResolvedValue(null);
    for (const query of [
      "?format=json",
      "?format=csv&version=9",
      "?format=json&bundle=self-contained&version=9",
    ]) {
      const res = await get(query, "nope");
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("Not found");
    }
    expect(questionnaireFileClient.write).not.toHaveBeenCalled();
    expect(formExportClient.write).not.toHaveBeenCalled();
  });

  it.each([
    [503, "Questionnaire files are not available on this install."],
    [502, "The questionnaire file service could not be reached."],
    [422, "a questionnaire has at most 200 questions"],
  ])(
    "T48 the file client's failure is its status (%i) and its error as the body",
    async (status, error) => {
      questionnaireFileClient.write.mockResolvedValue({
        ok: false,
        status,
        error,
      });
      const res = await get("?format=json");
      expect(res.status).toBe(status);
      expect(await res.text()).toBe(error);
    },
  );

  it("T48 the CSV writer's failure is its status and its error as the body", async () => {
    formExportClient.write.mockResolvedValue({
      ok: false,
      status: 503,
      error: "Exporting forms is not available on this install.",
    });
    const res = await get("?format=csv");
    expect(res.status).toBe(503);
    expect(await res.text()).toBe(
      "Exporting forms is not available on this install.",
    );
  });

  it("T48 the route is GET only", async () => {
    const mod = await loadSrc(ROUTE);
    expect(typeof mod.GET).toBe("function");
    for (const m of ["POST", "PUT", "PATCH", "DELETE"])
      expect(mod[m]).toBeUndefined();
  });
});
