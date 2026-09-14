// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import QualificationsList, {
  type ListItem,
} from "@/app/qualifications/QualificationsList";

afterEach(cleanup);

const item = (over: Partial<ListItem> = {}): ListItem => ({
  id: "abc123",
  systemName: "MicroCredit Assist Score (MCAS)",
  systemVersion: "v1.2.0",
  company: "Creditum AI SARL",
  description: "Credit scoring for consumer loans.",
  savedAt: "2026-09-11T08:42:00.000Z",
  answers: 13,
  risks: 5,
  ...over,
});

describe("the compiled qualifications list", () => {
  it("shows each one with its name, version, company and timestamp", () => {
    render(<QualificationsList items={[item()]} />);
    expect(screen.getByText(/MicroCredit Assist Score/)).toBeTruthy();
    expect(screen.getByText(/v1\.2\.0/)).toBeTruthy();
    expect(screen.getByText(/Creditum AI SARL/)).toBeTruthy();
    // the timestamp, to the minute, not just the date
    expect(screen.getByText(/2026-09-11 08:42/)).toBeTruthy();
  });

  it("does not double the v when the provider typed one", () => {
    const { container } = render(<QualificationsList items={[item()]} />);
    expect(container.textContent).not.toContain("vv1.2.0");
    expect(container.textContent).toContain("v1.2.0");
  });

  it("adds the v when the provider did not type one", () => {
    const { container } = render(
      <QualificationsList items={[item({ systemVersion: "2.0" })]} />,
    );
    expect(container.textContent).toContain("v2.0");
  });

  it("links each row to its own page", () => {
    const { container } = render(<QualificationsList items={[item()]} />);
    const link = container.querySelector('a[href="/qualify/abc123"]');
    expect(link).toBeTruthy();
  });

  it("says how much each one contains", () => {
    render(<QualificationsList items={[item()]} />);
    expect(screen.getByText(/13 answers/)).toBeTruthy();
    expect(screen.getByText(/5 risks/)).toBeTruthy();
  });

  it("lists several, newest first as given", () => {
    const { container } = render(
      <QualificationsList
        items={[
          item({ id: "new", systemName: "Newer", savedAt: "2026-09-11T10:00:00.000Z" }),
          item({ id: "old", systemName: "Older", savedAt: "2026-09-01T10:00:00.000Z" }),
        ]}
      />,
    );
    const names = [...container.querySelectorAll("h3")].map((h) => h.textContent);
    expect(names[0]).toContain("Newer");
    expect(names[1]).toContain("Older");
  });

  it("has no modal: a row is a link, not a dialog trigger", () => {
    const { container } = render(<QualificationsList items={[item()]} />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector(".qf-modal")).toBeNull();
  });

  it("invites a first qualification when there are none", () => {
    render(<QualificationsList items={[]} />);
    expect(screen.getByText(/haven't qualified any system yet/i)).toBeTruthy();
    expect(screen.getByText(/Start your first qualification/i)).toBeTruthy();
  });
});
