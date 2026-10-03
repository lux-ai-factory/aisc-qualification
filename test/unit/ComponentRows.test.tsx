// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/app/p/[project]/qualify/new/prefill-actions", () => ({ readDocument: vi.fn() }));
vi.mock("@/app/p/[project]/qualify/new/actions", () => ({ submitQualification: vi.fn() }));

import { vi } from "vitest";
import ComponentRows from "@/app/p/[project]/qualify/new/ComponentRows";
import QualifyForm from "@/app/p/[project]/qualify/new/QualifyForm";
import { COMPONENT_TYPES } from "@/data/componentFields";
import { formVersion } from "../support/forms";

// The Components block on the form: rows with their keys in
// hidden fields, suggestions from the extraction marked as such, and the block on every form.

afterEach(cleanup);

const carried = { key: "11111111-1111-4111-8111-111111111111", name: "Scoring model", role: "Scores",
                  type: "DecisionTree", provider: "in_house" as const, providerName: "" };

const value = (name: string) => (document.querySelector(`[name="${name}"]`) as HTMLInputElement | null)?.value;

describe("ComponentRows", () => {
  it("a carried row posts its key; the types are the block's one list", () => {
    render(<ComponentRows initial={[carried]} />);
    expect(value("component:0:key")).toBe(carried.key);
    expect(value("component:0:name")).toBe("Scoring model");
    const types = [...document.querySelectorAll('[name="component:0:type"] option')].map((o) => (o as HTMLOptionElement).value);
    expect(types.filter(Boolean)).toEqual(COMPONENT_TYPES.map((k) => k.id));
  });

  it("a card without components starts with no row and a way to add one", () => {
    render(<ComponentRows />);
    expect(document.querySelector('[name^="component:"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /add a component/i }));
    expect(value("component:0:key")).toBe("");
    expect(document.querySelector('[name="component:0:name"]')).not.toBeNull();
  });

  it("a suggestion from the extraction is marked, keyless, and can be removed", () => {
    render(<ComponentRows initial={[{ ...carried, key: "", type: "", suggested: true }]} />);
    expect(screen.getByText(/suggested from your answer to 2\(c\)/i)).toBeTruthy();
    expect(value("component:0:key")).toBe("");
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(document.querySelector('[name="component:0:name"]')).toBeNull();
  });

  it("the third party's name is asked only for a third party", () => {
    render(<ComponentRows initial={[carried]} />);
    expect(document.querySelector('[name="component:0:providerName"]')).toBeNull();
    fireEvent.change(document.querySelector('[name="component:0:provider"]') as HTMLSelectElement, { target: { value: "third_party" } });
    expect(document.querySelector('[name="component:0:providerName"]')).not.toBeNull();
  });

  it("says a test set is not a component", () => {
    render(<ComponentRows />);
    expect(screen.getByText(/test set is not a component/i)).toBeTruthy();
  });
});

describe("the block is on every form, before the risks", () => {
  it("even a form with no blocks at all", () => {
    render(<QualifyForm project="mcas" {...({ form: formVersion({ blocks: [], questions: [] }) } as object)}
      initial={{ metadata: {} as never, answers: {}, risks: [], components: [carried] } as never} />);
    expect(screen.getByRole("heading", { name: /components/i })).toBeTruthy();
    expect(value("component:0:key")).toBe(carried.key);
  });
});

import AnsweredForm from "@/app/p/[project]/qualify/[id]/AnsweredForm";

describe("a saved card shows its components", () => {
  const metadata = { systemName: "MCAS", systemVersion: "1.2.0", company: "LIST", description: "", targetUseCase: "",
    targetUsers: "", intendedDeployers: null, targetSystemTags: [], sectorTags: [], marketFormTags: [], localityTags: [] };
  it("with kind and provider", () => {
    render(<AnsweredForm metadata={metadata} answers={[]} risks={[]} systemComponents={[
      { id: "c1", name: "Scoring model", role: "Scores", kind: "model", provider: "in_house", providerName: null },
      { id: "c2", name: "Hosted explanation LLM", role: null, kind: "llm", provider: "third_party", providerName: "OpenAI" },
    ]} />);
    expect(screen.getByText("Components (2)")).toBeTruthy();
    expect(screen.getByText(/Provided by OpenAI/)).toBeTruthy();
    expect(screen.getByText("LLM or foundation model")).toBeTruthy();
  });
  it("a card without components shows no section", () => {
    render(<AnsweredForm metadata={metadata} answers={[]} risks={[]} />);
    expect(screen.queryByText(/^Components/)).toBeNull();
  });
});
