// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CardDownloads from "@/app/qualify/[id]/CardDownloads";
import OntologyView from "@/app/qualify/[id]/OntologyView";
import type { OntologyView as View } from "@/domain/OntologyView";
import { installReactFlowEnv } from "../support/reactFlowEnv";

afterEach(cleanup);
beforeAll(installReactFlowEnv);

const node = (id: string, label: string, cls: string) => ({
  id,
  label,
  cls,
  vair: null,
  fullText: null,
  provenance: "form" as const,
});

const view: View = {
  system: node("system", "MicroCredit Assist Score", "AISystem"),
  answers: [],
  rows: [
    {
      property: "hasPurpose",
      label: "Purpose",
      citation: "Annex IV 1(a)",
      nodes: [node("purpose", "Score loan applications", "AIPurpose")],
    },
  ],
  chains: [
    {
      citation: "Art 9(2)",
      risk: node("risk0", "A creditworthy applicant is rejected", "Risk"),
      source: null,
      vulnerability: null,
      consequence: null,
      impact: null,
      stakeholder: null,
      control: null,
      followUp: null,
      areas: [],
    },
  ],
  counts: {
    nodes: 4,
    triples: 12,
    risks: 1,
    reviewed: 0,
    untyped: 0,
    flagged: 0,
    needsTerm: 0,
    unclassifiable: 0,
  },
};

const DOWNLOADS = {
  pdf: "/api/q/abc/ai-card.pdf",
  json: "/api/q/abc/ai-card.json",
  jsonld: "/api/q/abc/ontology.jsonld",
};

describe("the card's downloads", () => {
  it("offers the PDF, the card JSON and the graph as JSON-LD", () => {
    const { container } = render(<CardDownloads downloads={DOWNLOADS} />);
    const pdf = container.querySelector(`a[href="${DOWNLOADS.pdf}"]`)!;
    const json = container.querySelector(`a[href="${DOWNLOADS.json}"]`)!;
    const jsonld = container.querySelector(`a[href="${DOWNLOADS.jsonld}"]`)!;
    expect(pdf.textContent).toMatch(/PDF/);
    expect(json.textContent).toMatch(/JSON/);
    expect(jsonld.textContent).toMatch(/JSON-LD/);
  });

  it("says what the card JSON holds, since it is the lossless form", () => {
    const { container } = render(<CardDownloads downloads={DOWNLOADS} />);
    const json = container.querySelector(`a[href="${DOWNLOADS.json}"]`)!;
    const title = json.getAttribute("title")!;
    expect(title).toMatch(/citation/i);
    expect(title).toMatch(/graph/i);
  });

  it("asks the browser to save the JSON rather than show it", () => {
    const { container } = render(<CardDownloads downloads={DOWNLOADS} />);
    expect(
      container.querySelector(`a[href="${DOWNLOADS.json}"]`)!.hasAttribute("download"),
    ).toBe(true);
  });

  it("opens the PDF in its own tab, safely", () => {
    const { container } = render(<CardDownloads downloads={DOWNLOADS} />);
    const pdf = container.querySelector(`a[href="${DOWNLOADS.pdf}"]`)!;
    expect(pdf.getAttribute("target")).toBe("_blank");
    expect(pdf.getAttribute("rel")).toContain("noopener");
  });
});

function mountCard() {
  return render(
    <OntologyView
      qualificationId="abc"
      initialView={view}
      initialProblems={[]}
      vocabularies={{}}
      downloads={DOWNLOADS}
    />,
  );
}

describe("where the downloads sit", () => {
  it("are at the top of the card, above the graph", () => {
    const { container } = mountCard();
    const head = container.querySelector(".onto-head")!;
    expect(head.querySelector(".onto-downloads")).toBeTruthy();
    // and the canvas is what follows
    const section = container.querySelector("section.onto")!;
    expect(section.firstElementChild).toBe(head);
    expect(section.lastElementChild!.className).toContain("onto-canvas");
  });

  it("stay there when the vertical view is open", () => {
    const { container } = mountCard();
    fireEvent.click(screen.getByRole("button", { name: "Vertical" }));
    expect(
      container.querySelector(".onto-head .onto-downloads"),
    ).toBeTruthy();
  });

  it("are offered once, not once per view", () => {
    const { container } = mountCard();
    fireEvent.click(screen.getByRole("button", { name: "Vertical" }));
    expect(container.querySelectorAll(".onto-downloads").length).toBe(1);
    expect(
      container.querySelectorAll(`a[href="${DOWNLOADS.pdf}"]`).length,
    ).toBe(1);
  });
});
