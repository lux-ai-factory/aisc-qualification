// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import DocumentUpload from "@/app/p/[project]/qualify/new/DocumentUpload";

// Choosing a file reads it; a file that cannot be read says why; one that can
// asks, with two buttons, what to do with the answers already there, and the
// button pressed is what applies it. There is no separate "read" step.
describe("the document upload on the new form", () => {
  afterEach(cleanup);

  function mount(props: Partial<React.ComponentProps<typeof DocumentUpload>> = {}) {
    const onPick = vi.fn();
    const onChoose = vi.fn();
    render(<DocumentUpload status={{ kind: "idle" }} onPick={onPick} onChoose={onChoose} {...props} />);
    return { onPick, onChoose };
  }

  it("offers to read a document", () => {
    mount();
    expect(screen.getByLabelText(/document/i)).toBeTruthy();
  });

  it("has no button to press before the file is read", () => {
    mount();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("reads the file as soon as it is chosen", () => {
    const { onPick } = mount();
    const file = new File(["x"], "doc.md");
    fireEvent.change(screen.getByLabelText(/document/i), { target: { files: [file] } });
    expect(onPick).toHaveBeenCalledWith(file);
  });

  it("says it is reading while it reads", () => {
    mount({ status: { kind: "reading" } });
    expect(screen.getByText(/reading/i)).toBeTruthy();
  });

  it("reports a document it could not read", () => {
    mount({ status: { kind: "error", error: "exe is not a format this reads" } });
    expect(screen.getByText(/not a format this reads/i)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says when nothing in the document matched", () => {
    mount({ status: { kind: "nothing" } });
    expect(screen.getByText(/nothing in that document/i)).toBeTruthy();
  });

  it("asks with two buttons, saying how many answers are at stake", () => {
    mount({ status: { kind: "choose", answered: 2, proposed: 5, risksAnswered: 0, risksProposed: 0 } });
    expect(screen.getByText(/2 answers/i)).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("applies the careful choice when that button is pressed", () => {
    const { onChoose } = mount({ status: { kind: "choose", answered: 2, proposed: 5, risksAnswered: 0, risksProposed: 0 } });
    fireEvent.click(screen.getByRole("button", { name: /only the empty/i }));
    expect(onChoose).toHaveBeenCalledWith("empty");
  });

  it("applies the replacing choice when that button is pressed", () => {
    const { onChoose } = mount({ status: { kind: "choose", answered: 2, proposed: 5, risksAnswered: 0, risksProposed: 0 } });
    fireEvent.click(screen.getByRole("button", { name: /replace/i }));
    expect(onChoose).toHaveBeenCalledWith("replace");
  });

  it("counts the risks too, when the document has them", () => {
    mount({ status: { kind: "choose", answered: 2, proposed: 5, risksAnswered: 1, risksProposed: 3 } });
    expect(screen.getByText(/3 risks/i)).toBeTruthy();
    expect(screen.getByText(/1 risk\b/i)).toBeTruthy();
  });

  it("says how many risks it filled", () => {
    mount({ status: { kind: "applied", filled: ["systemName"], kept: [], risks: 5, risksKept: false } });
    expect(screen.getByText(/5 risks/i)).toBeTruthy();
  });

  it("says when it left the risks somebody wrote", () => {
    mount({ status: { kind: "applied", filled: ["systemName"], kept: [], risks: 0, risksKept: true } });
    expect(screen.getByText(/risks as they were/i)).toBeTruthy();
  });

  it("reports what the upload did once applied", () => {
    mount({ status: { kind: "applied", filled: ["systemName", "company"], kept: ["q:annex-1:1a"], risks: 0, risksKept: false } });
    expect(screen.getByText(/filled 2/i)).toBeTruthy();
    expect(screen.getByText(/left 1/i)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("counts the components too, when the document has them", () => {
    mount({ status: { kind: "choose", answered: 2, proposed: 5, risksAnswered: 0, risksProposed: 3, componentsAnswered: 0, componentsProposed: 9 } });
    expect(screen.getByText(/9 components/i)).toBeTruthy();
  });

  it("says how many components it filled, and when it left somebody's", () => {
    mount({ status: { kind: "applied", filled: [], kept: [], risks: 0, risksKept: false, components: 9, componentsKept: false } });
    expect(screen.getByText(/9 components/i)).toBeTruthy();
    cleanup();
    mount({ status: { kind: "applied", filled: ["systemName"], kept: [], risks: 0, risksKept: false, components: 0, componentsKept: true } });
    expect(screen.getByText(/components as they were/i)).toBeTruthy();
  });
});
