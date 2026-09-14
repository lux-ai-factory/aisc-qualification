// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import NodeChip from "@/app/qualify/[id]/NodeChip";
import type { OntologyNode } from "@/domain/OntologyView";

// vitest runs with globals: false, so Testing Library's automatic cleanup does
// not fire. Without this, every render accumulates in document.body and a
// `screen` query finds the previous test's DOM.
afterEach(cleanup);

const node = (over: Partial<OntologyNode> = {}): OntologyNode => ({
  id: "n1",
  label: "Some node",
  cls: "RiskSource",
  vair: null,
  fullText: null,
  provenance: "form",
  ...over,
});

// The vocabulary the service reports: some classes have terms, and VAIR defines
// none at all for Risk, Vulnerability or AIUser.
const VOCAB = {
  RiskSource: ["Attack", "DataRiskSource", "ModelRiskSource"],
  Risk: [],
  Vulnerability: [],
  AIUser: [],
};

function mount(n: OntologyNode, onEdit = vi.fn()) {
  return {
    ...render(<NodeChip node={n} vocabularies={VOCAB} onEdit={onEdit} />),
    onEdit,
  };
}

describe("NodeChip term marker", () => {
  it("shows the term when the node has one", () => {
    mount(node({ vair: "DataRiskSource" }));
    expect(screen.getByText("DataRiskSource")).toBeTruthy();
    expect(screen.queryByText(/no term/i)).toBeNull();
  });

  it("flags a missing term only when the vocabulary offers one", () => {
    mount(node({ cls: "RiskSource", vair: null }));
    expect(screen.getByText(/no term/i)).toBeTruthy();
  });

  it("shows no marker at all when VAIR defines no term for the class", () => {
    // Risk, Vulnerability and AIUser have zero VAIR specialisations, so
    // "no term" would be reporting a gap that can never be filled.
    for (const cls of ["Risk", "Vulnerability", "AIUser"]) {
      const { unmount } = mount(node({ cls, vair: null }));
      expect(screen.queryByText(/no term/i), cls).toBeNull();
      unmount();
    }
  });

  it("shows no marker for a class the service did not report on", () => {
    const { container } = render(
      <NodeChip
        node={node({ cls: "AISystem", vair: null })}
        vocabularies={{}}
        onEdit={vi.fn()}
      />,
    );
    expect(container.textContent).not.toMatch(/no term/i);
  });

  it("keeps showing the class so an untyped node is still identifiable", () => {
    const { container } = mount(node({ cls: "Risk", vair: null, label: "R1" }));
    expect(container.textContent).toContain("R1");
    expect(container.textContent).toContain("Risk");
  });

  it("is a chip, not an editor: the editor is a pop-up the page opens", () => {
    const { container, onEdit } = mount(node());
    expect(container.querySelector("select")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    (container.querySelector("button") as HTMLElement).click();
    expect(onEdit).toHaveBeenCalled();
  });

  it("stops flagging a node a reviewer marked as having no applicable term", () => {
    // VAIR has 13 AIOperator terms but they are all Annex III public bodies, so
    // a commercial provider has no term to take. Once someone records that, the
    // chip must not keep asking.
    const { container } = mount(
      node({ cls: "RiskSource", vair: null, termNotApplicable: true }),
    );
    expect(screen.queryByText(/no term/i)).toBeNull();
    expect(container.textContent).toContain("RiskSource");
  });
});

describe("a class whose vocabulary names a different population", () => {
  it("shows the class, not a gap, when no term can describe the node", () => {
    // VAIR's AIOperator terms are Annex III public bodies, so a commercial
    // provider has none to take.
    render(
      <NodeChip
        node={{
          id: "provider",
          label: "Creditum AI SARL",
          cls: "AIOperator",
          vair: null,
          fullText: null,
          provenance: "form",
          termExpected: false,
        }}
        vocabularies={{ AIOperator: ["PublicAuthority", "EUAgency"] }}
        onEdit={() => {}}
      />,
    );
    expect(screen.queryByText("no term")).toBeNull();
    expect(screen.getByText("AIOperator")).toBeTruthy();
  });

  it("still flags a class whose terms do describe it", () => {
    render(
      <NodeChip
        node={{
          id: "purpose",
          label: "Score loan applications",
          cls: "Purpose",
          vair: null,
          fullText: null,
          provenance: "form",
        }}
        vocabularies={{ Purpose: ["Assessment", "Profiling"] }}
        onEdit={() => {}}
      />,
    );
    expect(screen.getByText("no term")).toBeTruthy();
  });
});

describe("a node the filler agent flagged", () => {
  const flagged = (flags: string[]) => ({
    id: "technique1",
    label: "Quantum annealing",
    cls: "AITechnique",
    vair: "MachineLearning",
    fullText: null,
    provenance: "extracted" as const,
    flags,
  });

  it("shows the flag, because that is the queue", () => {
    render(
      <NodeChip node={flagged(["ungrounded"])} vocabularies={{}} onEdit={() => {}} />,
    );
    expect(screen.getByText("ungrounded")).toBeTruthy();
  });

  it("shows every flag it carries", () => {
    const { container } = render(
      <NodeChip
        node={flagged(["ungrounded", "inflated"])}
        vocabularies={{}}
        onEdit={() => {}}
      />,
    );
    const badges = [...container.querySelectorAll(".onto-flag")].map(
      (b) => b.textContent,
    );
    expect(badges).toEqual(["ungrounded", "inflated"]);
  });

  it("marks the chip so it stands out from a settled one", () => {
    const { container } = render(
      <NodeChip node={flagged(["sentence"])} vocabularies={{}} onEdit={() => {}} />,
    );
    expect(container.querySelector(".onto-node")!.className).toContain("onto-flagged");
  });

  it("leaves an unflagged node alone", () => {
    const { container } = render(
      <NodeChip
        node={{ ...flagged([]), flags: undefined }}
        vocabularies={{}}
        onEdit={() => {}}
      />,
    );
    expect(container.querySelector(".onto-flag")).toBeNull();
    expect(container.querySelector(".onto-node")!.className).not.toContain(
      "onto-flagged",
    );
  });
});
