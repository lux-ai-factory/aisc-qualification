// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { OntologyView as View } from "@/domain/OntologyView";
import { installReactFlowEnv } from "../support/reactFlowEnv";

const resetOntology = vi.fn();
vi.mock("@/app/p/[project]/qualify/[id]/ontology-actions", () => ({
  patchOntologyNode: vi.fn(),
  resetOntology: (...args: unknown[]) => resetOntology(...args),
}));

import OntologyView from "@/app/p/[project]/qualify/[id]/OntologyView";

// Undoing a reviewer's corrections throws away their work, so the button asks
// first, in the page itself, and only the second answer undoes anything.

afterEach(() => {
  cleanup();
  resetOntology.mockReset();
});
beforeAll(installReactFlowEnv);

const node = (id: string, label: string, cls: string) => ({
  id,
  label,
  cls,
  vair: null,
  fullText: null,
  provenance: "form" as const,
});

const view = (reviewed: number): View => ({
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
  chains: [],
  counts: {
    nodes: 2,
    triples: 4,
    risks: 0,
    reviewed,
    untyped: 0,
    flagged: 0,
    needsTerm: 0,
    unclassifiable: 0,
  },
});

function mount(reviewed: number) {
  return render(
    <OntologyView
      projectId="proj"
      qualificationId="abc"
      initialView={view(reviewed)}
      initialProblems={[]}
      vocabularies={{}}
      downloads={{ pdf: "/p", json: "/j", jsonld: "/jl" }}
    />,
  );
}

describe("undoing the reviewer's corrections", () => {
  it("names how many corrections it undoes", () => {
    mount(3);
    expect(
      screen.getByRole("button", { name: "Undo my 3 corrections" }),
    ).toBeTruthy();
  });

  it("says correction, not corrections, for one", () => {
    mount(1);
    expect(
      screen.getByRole("button", { name: "Undo my 1 correction" }),
    ).toBeTruthy();
  });

  it("asks in the page before undoing, without a browser dialog", () => {
    const confirm = vi.spyOn(window, "confirm");
    mount(3);
    fireEvent.click(
      screen.getByRole("button", { name: "Undo my 3 corrections" }),
    );
    expect(confirm).not.toHaveBeenCalled();
    expect(resetOntology).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      "Undo your 3 corrections to this AI card?",
    );
    expect(screen.getByRole("button", { name: "Undo them" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keep them" })).toBeTruthy();
    confirm.mockRestore();
  });

  it("Keep them leaves the corrections and brings the button back", () => {
    mount(3);
    fireEvent.click(
      screen.getByRole("button", { name: "Undo my 3 corrections" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Keep them" }));
    expect(resetOntology).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Undo my 3 corrections" }),
    ).toBeTruthy();
  });

  it("Undo them undoes them, once", async () => {
    resetOntology.mockResolvedValue({
      ok: true,
      view: view(0),
      problems: [],
    });
    mount(3);
    fireEvent.click(
      screen.getByRole("button", { name: "Undo my 3 corrections" }),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Undo them" }));
    });
    expect(resetOntology).toHaveBeenCalledTimes(1);
    expect(resetOntology).toHaveBeenCalledWith("proj", "abc");
    expect(screen.queryByRole("button", { name: /Undo my/ })).toBeNull();
  });
});
