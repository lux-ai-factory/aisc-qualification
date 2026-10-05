import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { KEY_QUESTIONS } from "@/data/keyQuestions";
import {
  ANNEX_POINTS,
  annexCitation,
  isAnnexPoint,
} from "@/domain/forms/annexPoints";

// The 14 Annex IV points a custom question may be tagged with. One file,
// src/data/annexPoints.json, read by the app and by services/ontology
// (airo_min/annex_points.py); both must agree with KEY_QUESTIONS, which the
// default form is made of.

const FILE = "src/data/annexPoints.json";
const read = () =>
  JSON.parse(readFileSync(FILE, "utf8")) as {
    _comment: string;
    points: { id: string; citation: string }[];
  };

describe("src/data/annexPoints.json (R2)", () => {
  it("R2 has exactly the 14 KEY_QUESTIONS ids, in order", () => {
    expect(read().points.map((p) => p.id)).toEqual(
      KEY_QUESTIONS.map((q) => q.id),
    );
  });

  it("R2 each point's citation is its question's citation", () => {
    expect(read().points.map((p) => p.citation)).toEqual(
      KEY_QUESTIONS.map((q) => q.citation),
    );
  });

  it("R2 has only the points and a comment", () => {
    expect(Object.keys(read()).sort()).toEqual(["_comment", "points"]);
    for (const p of read().points)
      expect(Object.keys(p).sort()).toEqual(["citation", "id"]);
  });
});

describe("src/domain/forms/annexPoints.ts (R2)", () => {
  it("R2 ANNEX_POINTS is the file's points", () => {
    expect(ANNEX_POINTS).toEqual(read().points);
  });

  it("R2 isAnnexPoint accepts the 14 ids and nothing else", () => {
    for (const q of KEY_QUESTIONS) expect(isAnnexPoint(q.id)).toBe(true);
    for (const s of ["", "1d", "1e", "3a", "2i", "Annex IV(1)(a)", "1A"]) {
      expect(isAnnexPoint(s)).toBe(false);
    }
  });

  it("R2 annexCitation names each point's citation", () => {
    expect(annexCitation("1a")).toBe("Annex IV(1)(a)");
    expect(annexCitation("1de")).toBe("Annex IV(1)(d)-(e)");
    expect(annexCitation("2h")).toBe("Annex IV(2)(h)");
  });
});
