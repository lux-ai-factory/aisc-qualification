import { describe, it, expect } from "vitest";
import {
  QualificationFormParser,
  FormValidationError,
} from "@/server/forms/QualificationFormParser";
import type { ResolvedQuestionnaireVersion } from "@/domain/forms/types";
import { COMPONENT_KINDS, COMPONENT_BLOCK, COMPONENT_TYPES, isComponentKind } from "@/data/componentFields";
import { assignComponentKeys } from "@/domain/systemComponents";
import { cardAsFormStart, type CardContent } from "@/domain/cardVersions";

// The card's Components block (targets plan v2, 2026-09-29, QL1 to QL4): one row per part of the
// system, each with a stable key carried from one card version to the next, so assessments and
// their results can name it. On every card, whatever its questionnaire, like the identity fields.

/** A form with no blocks and no questions: only the identity, which is always there. */
const EMPTY_FORM = {
  questionnaireId: "q", questionnaireName: "Q", description: "", listed: true, builtin: false, retired: false,
  versionId: "v", versionNumber: 1, blocks: [], questions: [],
} as unknown as ResolvedQuestionnaireVersion;

function identity(): FormData {
  const fd = new FormData();
  fd.set("systemName", "MCAS");
  fd.set("systemVersion", "1.2.0");
  fd.set("company", "LIST");
  return fd;
}

function addComponent(fd: FormData, i: number, over: Partial<Record<string, string>> = {}) {
  // A row's one Type list (2026-09-30): a VAIR AIComponent term, or one of our own types.
  const v = { name: "Scoring model", role: "Scores each application", type: "DecisionTree", provider: "in_house", ...over };
  for (const [k, val] of Object.entries(v)) fd.set(`component:${i}:${k}`, val);
}

const parse = (fd: FormData) => new QualificationFormParser().parse(fd, EMPTY_FORM);

describe("QL1 the kinds of component", () => {
  it("data the system is built on is a kind; a test set is not", () => {
    const ids = COMPONENT_KINDS.map((k) => k.id);
    expect(ids).toEqual(["model", "rule_engine", "llm", "training_data", "validation_data", "other_data",
      "pipeline", "interface", "other"]);
    expect(ids.some((id) => /test/.test(id))).toBe(false);
    expect(COMPONENT_BLOCK.help).toMatch(/test set is not a component/i);
    expect(isComponentKind("training_data")).toBe(true);
    expect(isComponentKind("test_data")).toBe(false);
    // and none of the types the form offers is a test set either
    expect(COMPONENT_TYPES.some((t) => /test/i.test(t.id))).toBe(false);
  });
});

describe("QL1 the rows, parsed and checked", () => {
  it("a card may have no components", () => {
    expect(parse(identity()).systemComponents).toEqual([]);
  });

  it("parses rows in order, with their posted keys", () => {
    const fd = identity();
    addComponent(fd, 0, { key: "k-1" });
    addComponent(fd, 3, { name: "Training data", type: "training_data", role: "" });
    const rows = parse(fd).systemComponents;
    expect(rows).toEqual([
      { position: 0, key: "k-1", name: "Scoring model", role: "Scores each application", kind: "model",
        vairType: "DecisionTree", provider: "in_house", providerName: null },
      { position: 1, key: null, name: "Training data", role: null, kind: "training_data", vairType: null,
        provider: "in_house", providerName: null },
    ]);
  });

  it("skips a completely empty row", () => {
    const fd = identity();
    addComponent(fd, 0);
    for (const f of ["name", "role", "type", "providerName"]) fd.set(`component:1:${f}`, "");
    expect(parse(fd).systemComponents).toHaveLength(1);
  });

  it("needs a name and a type from the list, naming the row", () => {
    const fd = identity();
    addComponent(fd, 0, { name: "" });
    expect(() => parse(fd)).toThrow(new FormValidationError("Component 1: its name is required."));
    const fd2 = identity();
    addComponent(fd2, 0, { type: "test_data" });
    expect(() => parse(fd2)).toThrow(/Component 1: pick its type/);
  });

  it("a third party needs its name", () => {
    const fd = identity();
    addComponent(fd, 0, { provider: "third_party", providerName: "" });
    expect(() => parse(fd)).toThrow(/Component 1: .*third party/);
    const ok = identity();
    addComponent(ok, 0, { provider: "third_party", providerName: "OpenAI" });
    expect(parse(ok).systemComponents[0].providerName).toBe("OpenAI");
  });

  it("names are unique on a card, whatever their case", () => {
    const fd = identity();
    addComponent(fd, 0);
    addComponent(fd, 1, { name: "scoring MODEL " });
    expect(() => parse(fd)).toThrow(/Component 2: .*already/);
  });

  it("a name is at most 120 characters", () => {
    const fd = identity();
    addComponent(fd, 0, { name: "x".repeat(121) });
    expect(() => parse(fd)).toThrow(/120/);
  });
});

describe("QL2 keys: carried from the card before, never made up by the browser", () => {
  const uuid = (() => { let n = 0; return () => `new-${++n}`; })();
  const row = (key: string | null, name = "Scoring model") =>
    ({ position: 0, key, name, role: null, kind: "model", vairType: "DecisionTree", provider: "in_house", providerName: null }) as const;

  it("a row carried from the card before keeps its key", () => {
    expect(assignComponentKeys([row("k-1")], new Set(["k-1"]), uuid)[0].key).toBe("k-1");
  });

  it("a new row gets a fresh key", () => {
    const [r] = assignComponentKeys([row(null)], new Set(["k-1"]), uuid);
    expect(r.key).toMatch(/^new-/);
  });

  it("a key the card before does not have is refused", () => {
    expect(() => assignComponentKeys([row("forged")], new Set(["k-1"]), uuid)).toThrow(FormValidationError);
  });

  it("one key may not be used twice", () => {
    expect(() => assignComponentKeys([row("k-1"), row("k-1", "Other")], new Set(["k-1"]), uuid))
      .toThrow(/twice/);
  });
});

describe("QL4 the next card starts from the last one's components", () => {
  const base: CardContent = {
    systemName: "MCAS", systemVersion: "1.2.0", company: "LIST", description: "", targetUseCase: "",
    targetUsers: "", intendedDeployers: null, targetSystemTags: [], sectorTags: [], marketFormTags: [],
    localityTags: [], answers: [], risks: [],
  };

  it("rows with their keys, in order", () => {
    const start = cardAsFormStart({
      ...base,
      systemComponents: [
        { position: 1, key: "k-2", name: "Training data", role: null, kind: "training_data", provider: "in_house", providerName: null },
        { position: 0, key: "k-1", name: "Scoring model", role: "Scores", kind: "model", provider: "in_house", providerName: null },
      ],
    });
    expect(start.components?.map((c) => [c.key, c.name])).toEqual([["k-1", "Scoring model"], ["k-2", "Training data"]]);
    expect(start.components?.every((c) => !c.suggested)).toBe(true);
  });

  it("a card without rows offers what the filler extracted, as suggestions without keys", () => {
    const start = cardAsFormStart({
      ...base,
      ontologyExtracted: { components: [{ label: "Scoring model", vair: "vair:MachineLearning" }, "Policy-rule engine"] },
    });
    expect(start.components).toEqual([
      { key: "", name: "Scoring model", role: "", type: "", provider: "in_house", providerName: "", suggested: true },
      { key: "", name: "Policy-rule engine", role: "", type: "", provider: "in_house", providerName: "", suggested: true },
    ]);
  });

  it("no rows and no extraction: no components", () => {
    expect(cardAsFormStart(base).components ?? []).toEqual([]);
  });
});
