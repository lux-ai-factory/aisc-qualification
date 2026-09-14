// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Methodology, { type MethodologyFacts } from "@/app/methodology/Methodology";

afterEach(cleanup);

const facts: MethodologyFacts = {
  questions: 14,
  optionalQuestions: 4,
  riskFields: 8,
  pickers: { marketForm: 4, locality: 4, impactArea: 4, affected: 2 },
  schema: { classes: 19, properties: 19 },
  vocabulary: { classes: 19, terms: 331, typed: 14 },
};

const mount = (over: Partial<MethodologyFacts> = {}) =>
  render(<Methodology facts={{ ...facts, ...over }} />);

describe("the methodology page explains the filler workflow", () => {
  it("puts the loop inside the step that runs it, not after the procedure", () => {
    const { container } = mount();
    const steps = [...container.querySelectorAll("ol.method-steps > li")];
    expect(steps[5].querySelector("ol.method-loop")).toBeTruthy();
    expect(steps[5].querySelector("table.method-stops")).toBeTruthy();
    expect(steps[5].querySelector("svg")).toBeTruthy();
  });

  it("draws the state machine it runs on", () => {
    const { container } = mount();
    const svg = container.querySelector("svg.method-diagram")!;
    expect(svg).toBeTruthy();
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toMatch(/state machine|workflow/i);
    const labels = [...svg.querySelectorAll("text")].map((t) => t.textContent);
    for (const state of ["load", "draft", "review", "revise", "publish", "done"]) {
      expect(labels).toContain(state);
    }
    // the two conditions that make it a loop rather than a line
    expect(svg.textContent).toMatch(/finding/i);
    expect(svg.textContent).toMatch(/settled/i);
  });

  it("scales the diagram instead of fixing its pixel width", () => {
    const { container } = mount();
    const svg = container.querySelector("svg.method-diagram")!;
    expect(svg.getAttribute("viewBox")).toBeTruthy();
    expect(svg.getAttribute("width")).toBeNull();
  });

  it("lays the review loop out as its own numbered rounds", () => {
    const { container } = mount();
    const steps = [...container.querySelectorAll("ol.method-loop > li")];
    expect(steps.length).toBe(5);
    const titles = steps.map((s) => s.querySelector("h3")?.textContent ?? "");
    expect(titles[0]).toMatch(/[Dd]raft/);
    expect(titles[1]).toMatch(/[Cc]ontrol/);
    expect(titles[2]).toMatch(/[Cc]ritic|[Rr]eview/);
    expect(titles[3]).toMatch(/[Rr]evise/);
    expect(titles[4]).toMatch(/[Pp]ublish/);
  });

  it("names every way the loop can stop, because all of them publish", () => {
    const { container } = mount();
    const rows = [...container.querySelectorAll("table.method-stops tbody tr")];
    expect(rows.length).toBe(4);
    const text = container.querySelector("table.method-stops")!.textContent ?? "";
    for (const rule of ["clean", "fixpoint", "cap", "budget"]) {
      expect(text).toContain(rule);
    }
  });

  it("lists the controls that run before the critic", () => {
    const { container } = mount();
    const text = container.textContent ?? "";
    for (const flag of [
      "ungrounded",
      "inflated",
      "sentence",
      "unsupported-term",
      "uncovered",
    ]) {
      expect(text).toContain(flag);
    }
  });

  it("says the draft is published flagged rather than withheld", () => {
    const { container } = mount();
    expect(container.textContent).toMatch(/flag/i);
    expect(container.textContent).toMatch(/every exit publishes|always publishes/i);
  });

  it("attributes the framework it runs on", () => {
    const { container } = mount();
    expect(container.textContent).toContain("BESSER Agentic Framework");
    expect(
      container.querySelector(
        'a[href="https://github.com/BESSER-PEARL/BESSER-Agentic-Framework"]',
      ),
    ).toBeTruthy();
    expect(container.textContent).toMatch(/MIT/);
  });

  it("says a person decides", () => {
    const { container } = mount();
    expect(container.textContent).toMatch(/you|a person|reviewer/i);
  });
});

describe("the methodology page reads as a procedure", () => {
  it("lays the method out as numbered steps, in the order they happen", () => {
    const { container } = mount();
    const steps = [...container.querySelectorAll("ol.method-steps > li")];
    expect(steps.length).toBe(8);
    const titles = steps.map((s) => s.querySelector("h3")?.textContent ?? "");
    expect(titles[0]).toMatch(/Answer/i);
    expect(titles[1]).toMatch(/[Tt]ag/);
    expect(titles[2]).toMatch(/risk/i);
    expect(titles[3]).toMatch(/graph/i);
    expect(titles[4]).toMatch(/[Tt]ype/);
    expect(titles[5]).toMatch(/[Rr]ead|prose|draft/i);
    expect(titles[6]).toMatch(/[Rr]eview|correct/i);
    expect(titles[7]).toMatch(/[Ee]xport|[Dd]ownload/);
  });

  it("has no step that refers forward or doubles back", () => {
    const { container } = mount();
    const text = container.textContent ?? "";
    // The filler loop used to arrive as "Step 5a" after the procedure ended.
    expect(text).not.toMatch(/Step \d+[a-z]/);
    // Each ontology is explained inside the step that first needs it, so there
    // is no separate section to jump to afterwards.
    const headings = [...container.querySelectorAll("h2")].map((h) => h.textContent);
    expect(headings).not.toContain("How AIRO and VAIR join");
  });

  it("explains each ontology inside the step that first uses it", () => {
    const { container } = mount();
    const steps = [...container.querySelectorAll("ol.method-steps > li")];
    expect(steps[3].textContent).toContain("AI Risk Ontology");
    expect(steps[3].querySelector(".method-attrib")).toBeTruthy();
    expect(steps[4].textContent).toContain("Vocabulary of AI Risks");
    expect(steps[4].querySelector(".method-attrib")).toBeTruthy();
    expect(steps[4].textContent).toContain("rdfs:subClassOf");
  });

  it("gives every step its input, its authority and its output", () => {
    const { container } = mount();
    for (const step of container.querySelectorAll("ol.method-steps > li")) {
      const labels = [...step.querySelectorAll("dt")].map((d) => d.textContent);
      expect(labels).toEqual(["Input", "Authority", "Output"]);
      for (const value of step.querySelectorAll("dd")) {
        expect((value.textContent ?? "").trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("names the authority of each step, article by article", () => {
    const { container } = mount();
    const authorities = [
      ...container.querySelectorAll("ol.method-steps > li dd.method-authority"),
    ].map((d) => d.textContent ?? "");
    expect(authorities[0]).toMatch(/Annex IV/);
    expect(authorities[2]).toMatch(/Art 9/);
    expect(authorities.join(" ")).toMatch(/AIRO/);
    expect(authorities.join(" ")).toMatch(/VAIR/);
  });

  it("shows a strip that is the steps, not a second story", () => {
    // The strip must be the steps themselves, not a second list beside them.
    const { container } = mount();
    const stages = [...container.querySelectorAll(".method-pipe > li")].map(
      (s) => (s.textContent ?? "").trim(),
    );
    const titles = [...container.querySelectorAll("ol.method-steps > li > h3")].map(
      (h) => (h.textContent ?? "").trim(),
    );
    expect(stages.length).toBe(titles.length);
    stages.forEach((stage, i) => {
      expect(titles[i].split(" ")[0]).toBe(stage);
    });
  });

  it("states the limits as a numbered list, not a paragraph", () => {
    const { container } = mount();
    const limits = [...container.querySelectorAll("ol.method-limits > li")];
    expect(limits.length).toBe(4);
    expect(limits.map((l) => l.textContent ?? "").join(" ")).toMatch(
      /does not decide/i,
    );
  });
});

describe("the methodology page", () => {
  it("attributes AIRO with its authors, version, licence and source", () => {
    const { container } = mount();
    expect(screen.getAllByText(/AI Risk Ontology/).length).toBeGreaterThan(0);
    expect(container.textContent).toContain("Delaram Golpayegani");
    expect(container.textContent).toContain("ADAPT Centre");
    expect(container.querySelector('a[href="https://w3id.org/airo"]')).toBeTruthy();
    expect(
      container.querySelector('a[href="https://doi.org/10.5281/zenodo.10894750"]'),
    ).toBeTruthy();
  });

  it("attributes VAIR the same way", () => {
    const { container } = mount();
    expect(screen.getAllByText(/Vocabulary of AI Risks/).length).toBeGreaterThan(0);
    expect(container.querySelector('a[href="https://w3id.org/vair"]')).toBeTruthy();
    expect(
      container.querySelector('a[href="https://doi.org/10.5281/zenodo.10894914"]'),
    ).toBeTruthy();
  });

  it("names the licence and links to it, as CC BY requires", () => {
    const { container } = mount();
    expect(container.textContent).toMatch(/CC BY 4\.0/);
    expect(
      container.querySelector('a[href="https://creativecommons.org/licenses/by/4.0/"]'),
    ).toBeTruthy();
  });

  it("links the Act itself, not just a paraphrase of it", () => {
    const { container } = mount();
    expect(
      container.querySelector('a[href="https://eur-lex.europa.eu/eli/reg/2024/1689/oj"]'),
    ).toBeTruthy();
    expect(container.textContent).toMatch(/Annex IV/);
  });

  it("explains how the two ontologies join", () => {
    const { container } = mount();
    // the actual mechanism, with a real example from the file
    expect(container.textContent).toContain("rdfs:subClassOf");
    expect(container.textContent).toContain("vair:Police");
    expect(container.textContent).toContain("airo:AIOperator");
  });

  it("states what we implement, from the code rather than from prose", () => {
    const { container } = mount({ schema: { classes: 19, properties: 21 } });
    expect(container.textContent).toContain("21 properties");
  });

  it("counts the form from the question set, not by hand", () => {
    const { container } = mount({ questions: 15, optionalQuestions: 5 });
    expect(container.textContent).toContain("15 questions");
    expect(container.textContent).toContain("5");
  });

  it("says how much of the vocabulary is in use", () => {
    const { container } = mount({ vocabulary: { classes: 19, terms: 331, typed: 14 } });
    expect(container.textContent).toContain("331");
  });

  it("keeps going when the ontology service is down", () => {
    const { container } = mount({ vocabulary: null });
    expect(container.textContent).not.toContain("331");
    expect(container.textContent).toMatch(/Vocabulary of AI Risks/);
  });

  it("drops the two closing sections that were not part of the procedure", () => {
    const { container } = mount();
    const headings = [...container.querySelectorAll("h2")].map((h) => h.textContent);
    expect(headings).not.toContain("Defect register: the sources");
    expect(headings).not.toContain("What the sources themselves rest on");
  });

  it("states what the procedure does not do", () => {
    const { container } = mount();
    expect(container.textContent).toMatch(/Annex III/);
    expect(container.textContent).toMatch(/not a legal|no legal|does not decide/i);
  });

  it("still says what it does not run, and why", () => {
    // The SHACL classifier stays in the limits: it is a limit of the procedure,
    // not a note about the sources.
    const { container } = mount();
    expect(container.textContent).toMatch(/sh:minCount/);
  });

  it("links no source it cannot verify", () => {
    // ISO's catalogue pages sit behind a bot challenge, so the standards are
    // named rather than linked: a dead or wrong link on an attribution page is
    // worse than no link.
    const { container } = mount();
    expect(container.querySelector('a[href*="iso.org"]')).toBeNull();
  });

  it("opens every external link safely in a new tab", () => {
    const { container } = mount();
    const external = [...container.querySelectorAll("a")].filter((a) =>
      (a.getAttribute("href") ?? "").startsWith("http"),
    );
    expect(external.length).toBeGreaterThan(5);
    for (const a of external) {
      expect(a.getAttribute("href")).toMatch(/^https:\/\//);
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toContain("noopener");
    }
  });
});
