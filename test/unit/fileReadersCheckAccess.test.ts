import { describe, it, expect, vi, beforeEach } from "vitest";

// The two server actions that read an uploaded file (a document into the form's answers, a question
// set into the set editor) took no project and asked no one: a server action can be posted to any
// path, so anyone signed in at the gateway could use the prefill reader (code review 2026-10-05).
// Each is now bound to its project and asks the platform first, as readQuestionnaireFile does.

const PROJECT = "a1b2c3d4-0000-4000-8000-000000000002";
const door = vi.fn(
  async (_p: string, _o: { write: boolean }) =>
    ({ db: {} }) as { db?: object; error?: string },
);
const prefillRead = vi.fn(async () => ({ ok: true }));
const formRead = vi.fn(async () => ({ ok: true }));

vi.mock("@/lib/projectDb", () => ({
  projectDbForAction: (p: string, o: { write: boolean }) => door(p, o),
}));
vi.mock("@/server/services/PrefillClient", () => ({
  prefillClient: { read: () => prefillRead() },
}));
vi.mock("@/server/services/FormImportClient", () => ({
  formImportClient: { read: () => formRead() },
}));

const withFile = (name: string) => {
  const fd = new FormData();
  fd.set(name, new File(["text"], "a.txt"));
  return fd;
};

beforeEach(() => {
  vi.clearAllMocks();
  door.mockResolvedValue({ db: {} });
});

describe("readDocument", () => {
  it("asks about the project it is bound to before reading", async () => {
    const { readDocument } =
      await import("@/app/p/[project]/qualify/new/prefill-actions");
    await readDocument(PROJECT, undefined, withFile("document"));
    expect(door).toHaveBeenCalledWith(PROJECT, { write: false });
    expect(prefillRead).toHaveBeenCalled();
  });

  it("reads nothing for a caller the platform refuses", async () => {
    door.mockResolvedValue({ error: "Not found." });
    const { readDocument } =
      await import("@/app/p/[project]/qualify/new/prefill-actions");
    const out = await readDocument(PROJECT, undefined, withFile("document"));
    expect(out).toEqual({ ok: false, error: "Not found." });
    expect(prefillRead).not.toHaveBeenCalled();
  });
});

describe("readQuestionSetFile", () => {
  it("asks about the project it is bound to before reading", async () => {
    const { readQuestionSetFile } =
      await import("@/app/p/[project]/question-sets/import/actions");
    await readQuestionSetFile(PROJECT, withFile("file"));
    expect(door).toHaveBeenCalledWith(PROJECT, { write: false });
    expect(formRead).toHaveBeenCalled();
  });

  it("reads nothing for a caller the platform refuses", async () => {
    door.mockResolvedValue({ error: "Not found." });
    const { readQuestionSetFile } =
      await import("@/app/p/[project]/question-sets/import/actions");
    expect(await readQuestionSetFile(PROJECT, withFile("file"))).toEqual({
      ok: false,
      error: "Not found.",
    });
    expect(formRead).not.toHaveBeenCalled();
  });
});
