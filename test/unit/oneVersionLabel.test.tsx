// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import QualificationsList, { type ListItem } from "@/app/p/[project]/qualifications/QualificationsList";
import CarriedNotice from "@/app/p/[project]/qualify/[id]/CarriedNotice";
import { cardHeading, keptNotice, versionLabel } from "@/domain/cardVersions";

// Version 1, revision 2 is named one way everywhere: the versions list, the kicker over a card, the
// notice on a card that is no longer current and the notice of what a card took from the one
// before. The one label is versionLabel: "Version 1", or "Version 1, revision 2".

afterEach(cleanup);

const item = (over: Partial<ListItem> = {}): ListItem => ({
  revision: 1,
  id: "abc123",
  systemName: "Mijke",
  systemVersion: "Pre-production",
  company: "Acme",
  description: "A matchbot.",
  savedAt: "2026-11-11T21:56:00.000Z",
  answers: 13,
  risks: 5,
  ...over,
});

describe("one way to name a version and its revision", () => {
  it("the kicker over a card is the same label as everywhere, for every revision", () => {
    expect(cardHeading(1, 1)).toBe(versionLabel(1, 1));
    expect(cardHeading(1, 2)).toBe(versionLabel(1, 2));
  });

  it("the versions list names a corrected card by the same label", () => {
    render(
      <QualificationsList project="mijke" items={[item({ id: "c1b", versionNumber: 1, revision: 2 })]} />,
    );
    expect(screen.queryByText(/AI card v1\.2/)).toBeNull();
    expect(screen.getByText(versionLabel(1, 2))).toBeTruthy();
  });

  it("the notice on an earlier revision of the latest version says which revision corrected it", () => {
    const kept = (keptNotice as unknown as (v: number, r: number, latest: number) => string)(1, 1, 2);
    expect(kept).toContain("Version 1 (corrected by revision 2)");
  });

  it("the notice of what a card took from the one before names that card's revision", () => {
    render(
      <CarriedNotice
        fromHref="/p/mijke/qualify/card-1b"
        review={{ from_version: 1, from_revision: 2, carried: ["a"], left: [], draft: "none" } as never}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain(versionLabel(1, 2));
  });
});
