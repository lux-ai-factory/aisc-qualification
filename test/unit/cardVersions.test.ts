import { describe, it, expect } from "vitest";
import { cardAsFormStart, cardStanding, nextCard } from "@/domain/cardVersions";

// A project has one AI system; its AI card is versioned. Every save makes the
// version after the latest (a row of core.system), and the card starts from
// the newest card before it, to be reviewed rather than typed again.
// (Rewritten for WP3, pipeline 2026-09-23: rows are {pid, number}; the draft
// case is gone, the other fixtures lost their frozen flag.)

const v = (number: number) => ({ pid: `v${number}`, number });

describe("nextCard", () => {
  it("is for the version after the latest", () => {
    const next = nextCard([v(1)], [{ id: "c1", systemId: "v1" }]);
    expect(next).toEqual({ versionNumber: 2, fromCardId: "c1", fromVersionNumber: 1 });
  });

  it("starts empty when no version has a card", () => {
    expect(nextCard([], [])).toEqual({
      versionNumber: 1,
      fromCardId: null,
      fromVersionNumber: null,
    });
  });

  it("starts from the newest card, not the first", () => {
    const next = nextCard(
      [v(3), v(2), v(1)],
      [
        { id: "c1", systemId: "v1" },
        { id: "c3", systemId: "v3" },
      ],
    );
    expect(next).toEqual({ versionNumber: 4, fromCardId: "c3", fromVersionNumber: 3 });
  });

  it("a latest version with no card still gets its next version", () => {
    // a save that failed after naming v2: the next save makes v3
    const next = nextCard([v(2), v(1)], [{ id: "c1", systemId: "v1" }]);
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
      targetUsers: "Loan officers", intendedDeployers: "", systemType: "", purpose: "", providerTerm: "", deployerTerm: "",
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
      // a card saved before the form spoke VAIR has no terms: the selects start empty
      sourceTerm: "", consequenceTerm: "", impactTerm: "", controlTerm: "", followUpControlTerm: "",
    });
  });
});


// One system: its page is the latest version's card, and every other card is
// history, read-only, pointing at the current one.
describe("cardStanding", () => {
  const versions = [v(2), v(1)];
  const cards = [{ id: "c1", systemId: "v1" }, { id: "c2", systemId: "v2" }];

  it("the newest version's card is the current one", () => {
    expect(cardStanding(versions, cards, "v2")).toEqual({
      versionNumber: 2, current: true, currentCardId: "c2",
    });
  });

  it("an older card says which version it is and which card is current", () => {
    expect(cardStanding(versions, cards, "v1")).toEqual({
      versionNumber: 1, current: false, currentCardId: "c2",
    });
  });

  it("no card at all has no current card", () => {
    expect(cardStanding(versions, [], "v1")).toEqual({
      versionNumber: 1, current: false, currentCardId: null,
    });
  });
});
