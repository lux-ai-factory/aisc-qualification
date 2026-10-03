import { describe, it, expect } from "vitest";
import { filterLibrary, overlapHints, overlapLabel } from "@/domain/forms/library";
import * as library from "@/domain/forms/library";
import { customQuestion, seededQuestion, setQuestion } from "../support/forms";

// The builder's left column: search, overlap hints and available updates, all pure and
// deterministic.
//
// Interface: groups are { formId, formName, questions: ResolvedQuestion[] };
// overlapHints returns a plain object questionId -> AnnexPointId;
// overlapLabel(point) is the chip text.

const groups = [
  {
    formId: "annex-iv-default",
    formName: "Annex IV default",
    questions: [seededQuestion("1a"), seededQuestion("2a")],
  },
  {
    formId: "acme",
    formName: "Acme AI policy",
    questions: [
      customQuestion("acme", "q1", { text: "Who signs off a  model release?", citation: "Acme AI Policy §4.2" }),
      customQuestion("acme", "q2", { text: "How are incidents reported?", citation: "" }),
    ],
  },
];

const texts = (gs: typeof groups) => gs.map((g) => [g.formName, g.questions.map((q) => q.localId)]);

describe("filterLibrary (R16)", () => {
  it("R16 an empty query returns every group as it is", () => {
    expect(filterLibrary(groups, "")).toEqual(groups);
    expect(filterLibrary(groups, "   ")).toEqual(groups);
  });

  it("R16 matches the text, ignoring case and runs of whitespace", () => {
    expect(texts(filterLibrary(groups, "  WHO   signs off a model "))).toEqual([["Acme AI policy", ["q1"]]]);
  });

  it("R16 matches the citation too", () => {
    expect(texts(filterLibrary(groups, "policy §4.2"))).toEqual([["Acme AI policy", ["q1"]]]);
    expect(texts(filterLibrary(groups, "annex iv(2)(a)"))).toEqual([["Annex IV default", ["2a"]]]);
  });

  it("R16 omits a group with no match", () => {
    expect(filterLibrary(groups, "no question says this")).toEqual([]);
  });

  it("R16 keeps the questions' order within a group", () => {
    expect(texts(filterLibrary(groups, "?"))).toEqual([
      ["Annex IV default", ["1a", "2a"]],
      ["Acme AI policy", ["q1", "q2"]],
    ]);
  });
});

describe("overlapHints (R23)", () => {
  const q = (id: string, annexPoint: string | null) => ({ questionId: id, annexPoint });
  const selected = [q("A", "2a"), q("B", "2a"), q("C", "1a"), q("N", null)];
  const candidates = [q("D", "2a"), q("E", "1a"), q("F", null), q("G", "2b")];

  it("R23 a question is hinted when another selected question answers the same point", () => {
    expect(overlapHints(selected as never, candidates as never)).toEqual({
      A: "2a",
      B: "2a",
      D: "2a",
      E: "1a",
    });
  });

  it("R23 a question alone on its point is not hinted, nor is an untagged one", () => {
    const hints = overlapHints(selected as never, candidates as never) as Record<string, string>;
    expect(hints.C).toBeUndefined();
    expect(hints.N).toBeUndefined();
    expect(hints.F).toBeUndefined();
    expect(hints.G).toBeUndefined();
  });

  it("R23 depends only on ids and tags: the same input gives the same output", () => {
    const a = overlapHints(selected as never, candidates as never);
    const b = overlapHints(
      selected.map((x) => ({ ...x, text: "anything" })) as never,
      candidates.map((x) => ({ ...x, text: "else" })) as never,
    );
    expect(b).toEqual(a);
  });

  it("R23 nothing selected means no hints", () => {
    expect(overlapHints([], candidates as never)).toEqual({});
  });

  it("R23 the chip names the point's citation", () => {
    expect(overlapLabel("2a")).toBe("≈ overlaps Annex IV(2)(a)");
    expect(overlapLabel("1de")).toBe("≈ overlaps Annex IV(1)(d)-(e)");
  });
});

// "Update available"
//
// updatesAvailable(rows: BuilderRow[], groups: SetGroup[]) -> Record<rowIndex, Update>,
// SetGroup = { setId, setName, versionId, versionNumber, retired, questions } (a set's latest
// version), Update = { kind: "reworded", question, versionId, versionNumber }
//                  | { kind: "removed", setName, versionNumber }.

describe("updatesAvailable (T26)", () => {
  const pinned = setQuestion("acme", "q1", {
    text: "Who signs off a model release?",
    citation: "Acme AI Policy §4.2",
    setVersionId: "acme-v1",
  });
  const reworded = { ...pinned, text: "Who approves a model release?", setVersionId: "acme-v2", setVersionNumber: 2 };
  const acmeGroup = (questions: unknown[] = [reworded], over: Record<string, unknown> = {}) => ({
    setId: "acme",
    setName: "Acme AI policy",
    versionId: "acme-v2",
    versionNumber: 2,
    retired: false,
    questions,
    ...over,
  });
  const pick = (source = pinned, setVersionId = "acme-v1", rowKey = "r0") => ({
    rowKey,
    kind: "pick" as const,
    questionId: source.questionId,
    setVersionId,
    source,
  });
  const updatesAvailable = (rows: unknown[], gs: unknown[]) =>
    (library as unknown as { updatesAvailable: (r: unknown, g: unknown) => unknown }).updatesAvailable(rows, gs);

  it("T26 is exported by src/domain/forms/library.ts, and sourceUpdates is gone", () => {
    expect(typeof (library as Record<string, unknown>).updatesAvailable).toBe("function");
    expect((library as Record<string, unknown>).sourceUpdates).toBeUndefined();
  });

  it("T26 a pick whose set's latest version words it differently is listed as reworded, keyed by row index", () => {
    const other = pick(seededQuestion("2a"), "annex-iv-v1", "r1");
    expect(updatesAvailable([other, pick(pinned, "acme-v1", "r2")], [acmeGroup()])).toEqual({
      1: { kind: "reworded", question: reworded, versionId: "acme-v2", versionNumber: 2 },
    });
  });

  it.each([
    ["text", { text: "Who approves?" }],
    ["citation", { citation: "Acme AI Policy §4.3" }],
    ["required", { required: false }],
    ["annexPoint", { annexPoint: "2a" }],
    ["groupLabel", { groupLabel: "Governance" }],
  ])("T26 D13 a difference in %s alone is an update", (_field, change) => {
    const newer = { ...pinned, setVersionId: "acme-v2", setVersionNumber: 2, ...change };
    expect(updatesAvailable([pick()], [acmeGroup([newer as never])])).toEqual({
      0: { kind: "reworded", question: newer, versionId: "acme-v2", versionNumber: 2 },
    });
  });

  it("T26 a picked question absent from the set's latest version is listed as removed", () => {
    const other = setQuestion("acme", "q2", { text: "How are incidents reported?", setVersionId: "acme-v2" });
    expect(updatesAvailable([pick()], [acmeGroup([other])])).toEqual({
      0: { kind: "removed", setName: "Acme AI policy", versionNumber: 2 },
    });
  });

  it("T26 D13 the same wording in a newer set version is no update (the pin is never bumped silently)", () => {
    const same = { ...pinned, setVersionId: "acme-v2", setVersionNumber: 2 };
    expect(updatesAvailable([pick()], [acmeGroup([same])])).toEqual({});
  });

  it("T26 a pick already pinned to the group's version is never listed", () => {
    expect(updatesAvailable([pick(reworded, "acme-v2")], [acmeGroup()])).toEqual({});
    expect(updatesAvailable([pick(pinned, "acme-v2")], [acmeGroup([])])).toEqual({});
  });

  it("T26 a set missing from groups is not listed", () => {
    const annexGroup = {
      setId: "annex-iv", setName: "Annex IV", versionId: "annex-iv-v1", versionNumber: 1, retired: false,
      questions: [seededQuestion("2a")],
    };
    expect(updatesAvailable([pick()], [annexGroup])).toEqual({});
    expect(updatesAvailable([pick()], [])).toEqual({});
  });

  it("T26 questions a newer set version added are not listed: they were never picked", () => {
    const added = setQuestion("acme", "q9", { text: "New in v2?", setVersionId: "acme-v2" });
    expect(updatesAvailable([pick()], [acmeGroup([{ ...pinned, setVersionId: "acme-v2" }, added])])).toEqual({});
  });

  it("T26 retired groups count", () => {
    expect(updatesAvailable([pick()], [acmeGroup([reworded], { retired: true })])).toEqual({
      0: { kind: "reworded", question: reworded, versionId: "acme-v2", versionNumber: 2 },
    });
  });

  it("T26 a group of another set holding the same question id does not count: the pick's set decides", () => {
    const stranger = acmeGroup([reworded], { setId: "mix", setName: "Mixed", versionId: "mix-v9" });
    expect(updatesAvailable([pick()], [stranger])).toEqual({});
  });

  it("T26 it is pure: the rows and groups are not changed", () => {
    const rows = [pick()];
    const gs = [acmeGroup()];
    const before = JSON.stringify([rows, gs]);
    updatesAvailable(rows, gs);
    expect(JSON.stringify([rows, gs])).toBe(before);
  });
});
