import { describe, it, expect } from "vitest";
import { loadSrc } from "../support/forms";

// Two-level forms (docs/superpowers/two-level-forms-2026-09-25/01-spec.md), T53: importing a
// questionnaire file by reference. The "missing" list is built by the pure
// missingReferences(items, found) of src/domain/forms/references.ts, in item order.
//
// Interface (test author):
//   ReferenceItem   = { setId, setName, setVersion: number, scope, localId }   (a file item)
//   FoundSetVersion = { setId, number, name, versionId, keys: string[] }        (a set version
//                     this install has; keys are "<scope>:<localId>" of its questions; name is
//                     the set's name on this install)

const mod = () => loadSrc("domain/forms/references.ts");

const item = (setId: string, setName: string, setVersion: number, scope: string, localId: string) => ({
  setId,
  setName,
  setVersion,
  scope,
  localId,
});

const annexV1 = {
  setId: "annex-iv",
  number: 1,
  name: "Annex IV",
  versionId: "annex-iv-v1",
  keys: ["annex-1:1a", "annex-2:2a", "annex-2:2b"],
};
const acmeV1 = {
  setId: "acme",
  number: 1,
  name: "Acme AI policy",
  versionId: "acme-v1",
  keys: ["s-acme:q1", "s-acme:q2"],
};

describe("missingReferences (T53)", () => {
  it("T53 the spec's example, exactly", async () => {
    const { missingReferences } = await mod();
    const items = [
      item("annex-iv", "Annex IV", 1, "annex-2", "2a"),
      item("acme", "Acme AI policy", 3, "s-acme", "q1"),
      item("acme", "Acme AI policy", 3, "s-acme", "q2"),
      item("acme", "Acme AI policy", 1, "s-acme", "q9"),
    ];
    expect(missingReferences(items, [annexV1, acmeV1])).toEqual([
      'Question set "Acme AI policy" (acme) v3 is not on this install.',
      's-acme:q9 is not in question set "Acme AI policy" v1.',
    ]);
  });

  it("T53 everything found gives an empty list", async () => {
    const { missingReferences } = await mod();
    expect(
      missingReferences(
        [item("annex-iv", "Annex IV", 1, "annex-1", "1a"), item("acme", "Acme AI policy", 1, "s-acme", "q2")],
        [annexV1, acmeV1],
      ),
    ).toEqual([]);
    expect(missingReferences([], [])).toEqual([]);
  });

  it("T53 a missing set version is named once, with the setId when the file gives no setName", async () => {
    const { missingReferences } = await mod();
    expect(
      missingReferences(
        [
          item("gov", "", 2, "s-gov", "q1"),
          item("gov", "", 2, "s-gov", "q2"),
          item("gov", "", 2, "s-gov", "q3"),
        ],
        [annexV1],
      ),
    ).toEqual(['Question set "gov" (gov) v2 is not on this install.']);
  });

  it("T53 a missing question is named with the set's name on this install, not the file's", async () => {
    const { missingReferences } = await mod();
    expect(missingReferences([item("acme", "Renamed in the file", 1, "s-acme", "q7")], [acmeV1])).toEqual([
      's-acme:q7 is not in question set "Acme AI policy" v1.',
    ]);
  });

  it("T53 the list follows item order, mixing both kinds", async () => {
    const { missingReferences } = await mod();
    expect(
      missingReferences(
        [
          item("acme", "Acme AI policy", 1, "s-acme", "q8"),
          item("gov", "Governance", 1, "s-gov", "q1"),
          item("acme", "Acme AI policy", 1, "s-acme", "q9"),
          item("annex-iv", "Annex IV", 2, "annex-1", "1a"),
        ],
        [annexV1, acmeV1],
      ),
    ).toEqual([
      's-acme:q8 is not in question set "Acme AI policy" v1.',
      'Question set "Governance" (gov) v1 is not on this install.',
      's-acme:q9 is not in question set "Acme AI policy" v1.',
      'Question set "Annex IV" (annex-iv) v2 is not on this install.',
    ]);
  });

  it("T53 D15 references match by (setId, setVersion, scope, localId), never by names", async () => {
    const { missingReferences } = await mod();
    // same name, other id: not found
    expect(missingReferences([item("acme-2", "Acme AI policy", 1, "s-acme", "q1")], [acmeV1])).toEqual([
      'Question set "Acme AI policy" (acme-2) v1 is not on this install.',
    ]);
  });

  it("T53 it is pure", async () => {
    const { missingReferences } = await mod();
    const items = [item("acme", "Acme AI policy", 1, "s-acme", "q9")];
    const found = [acmeV1];
    const before = JSON.stringify([items, found]);
    missingReferences(items, found);
    expect(JSON.stringify([items, found])).toBe(before);
  });
});
