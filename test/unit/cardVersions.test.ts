import { describe, it, expect } from "vitest";
import { cardAsFormStart, nextCard } from "@/domain/cardVersions";

// A project has one AI system, in versions (the platform's), and each version
// has exactly one AI card. Submitting a card freezes its version, so the next
// card is always about a version that has none yet: the draft, or the one the
// platform makes after a frozen latest. It starts from the card before it, to
// be reviewed rather than typed again.

const v = (number: number, frozen: boolean) => ({
  pid: `v${number}`,
  number,
  frozen_at: frozen ? "2026-09-23T15:00:00Z" : null,
});

describe("nextCard", () => {
  it("is for the draft when the draft has no card yet", () => {
    const next = nextCard([v(2, false), v(1, true)], [{ id: "c1", systemId: "v1" }]);
    expect(next).toEqual({ versionNumber: 2, fromCardId: "c1", fromVersionNumber: 1 });
  });

  it("is for the version after a frozen latest", () => {
    const next = nextCard([v(1, true)], [{ id: "c1", systemId: "v1" }]);
    expect(next).toEqual({ versionNumber: 2, fromCardId: "c1", fromVersionNumber: 1 });
  });

  it("starts empty when no version has a card", () => {
    expect(nextCard([v(1, false)], [])).toEqual({
      versionNumber: 1,
      fromCardId: null,
      fromVersionNumber: null,
    });
  });

  it("starts from the newest card, not the first", () => {
    const next = nextCard(
      [v(3, true), v(2, true), v(1, true)],
      [
        { id: "c1", systemId: "v1" },
        { id: "c3", systemId: "v3" },
      ],
    );
    expect(next).toEqual({ versionNumber: 4, fromCardId: "c3", fromVersionNumber: 3 });
  });

  it("a frozen latest with no card still gets its next version", () => {
    // frozen by an evaluation: the card is written for the version after it,
    // which is where the engine's next change would land too
    const next = nextCard([v(2, true), v(1, true)], [{ id: "c1", systemId: "v1" }]);
    expect(next.versionNumber).toBe(3);
  });
});

describe("cardAsFormStart", () => {
  const card = {
    systemName: "MCAS",
    systemVersion: "1.2.0",
    company: "LIST",
    description: "Scores microcredit loans",
    targetUseCase: "Credit decisions",
    targetUsers: "Loan officers",
    intendedDeployers: null,
    targetSystemTags: ["classification"],
    sectorTags: ["finance"],
    marketFormTags: [],
    localityTags: ["eu"],
    answers: [
      { toolId: "annex-iv", questionId: "1a", answer: "It ranks applicants" },
      { toolId: "annex-iv", questionId: "2b", answer: "Gradient boosting" },
    ],
    risks: [
      {
        position: 1, risk: "Wrong rank", source: "Stale bureau data", vulnerability: null,
        consequence: "Refused credit", affected: "user", impactAreas: ["right"],
        control: "Officer review", followUpControl: null,
      },
      {
        position: 0, risk: "Bias", source: "History", vulnerability: "Proxies",
        consequence: "Unequal refusals", affected: "user", impactAreas: ["right", "freedom"],
        control: "Fairness test", followUpControl: "Quarterly audit",
      },
    ],
  };

  it("puts every answer back in the field it came from", () => {
    const start = cardAsFormStart(card);
    expect(start.answers).toEqual({
      "q:annex-iv:1a": "It ranks applicants",
      "q:annex-iv:2b": "Gradient boosting",
    });
  });

  it("keeps the system's description and the tags", () => {
    const start = cardAsFormStart(card);
    expect(start.metadata).toEqual({
      systemName: "MCAS", systemVersion: "1.2.0", company: "LIST",
      description: "Scores microcredit loans", targetUseCase: "Credit decisions",
      targetUsers: "Loan officers", intendedDeployers: "",
      targetSystemTags: ["classification"], sectorTags: ["finance"],
      marketFormTags: [], localityTags: ["eu"],
    });
  });

  it("keeps the risks in the order they were written", () => {
    const start = cardAsFormStart(card);
    expect(start.risks.map((r) => r.risk)).toEqual(["Bias", "Wrong rank"]);
    expect(start.risks[1]).toEqual({
      risk: "Wrong rank", source: "Stale bureau data", vulnerability: "",
      consequence: "Refused credit", affected: "user", areas: ["right"],
      control: "Officer review", followUpControl: "",
    });
  });
});
