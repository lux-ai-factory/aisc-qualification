// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { readDocument } = vi.hoisted(() => ({ readDocument: vi.fn() }));
vi.mock("@/app/p/[project]/qualify/new/prefill-actions", () => ({ readDocument }));
vi.mock("@/app/p/[project]/qualify/new/actions", () => ({ submitQualification: vi.fn() }));

// The MCAS form renders several hundred VAIR options, which jsdom takes about three seconds to
// mount and read back; under a full parallel run that can exceed the 5 s default. A browser
// does it in milliseconds, so this is the test environment's cost, not the page's.
vi.setConfig({ testTimeout: 15_000 });

import QualifyForm from "@/app/p/[project]/qualify/new/QualifyForm";
import { findExample } from "@/data/examples";
import { KEY_QUESTIONS } from "@/data/keyQuestions";

// The whole upload on the real form, with only the server action stood in for:
// choose a file, and either it lands (empty form) or two buttons ask first.
afterEach(cleanup);
beforeEach(() => readDocument.mockReset());

const mount = (initial?: NonNullable<ReturnType<typeof findExample>>) =>
  render(
    <QualifyForm
      project="p"
      keyQuestions={KEY_QUESTIONS}
      initial={initial}
    />,
  );

const pick = () =>
  fireEvent.change(screen.getByLabelText(/^document$/i), {
    target: { files: [new File(["System name: From the doc\n"], "doc.md")] },
  });

const field = (container: HTMLElement, name: string) =>
  container.querySelector(`[name="${name}"]`) as HTMLInputElement;

describe("uploading on the new form", () => {
  it("fills an empty form as soon as the file is chosen", async () => {
    readDocument.mockResolvedValue({
      ok: true,
      values: { systemName: "From the doc" },
      filled: ["systemName"],
      kept: [],
      model: null,
      risks: null,
      risksKept: false,
      risksProposed: 0,
    });
    const { container } = mount();
    pick();
    await waitFor(() => expect(field(container, "systemName").value).toBe("From the doc"));
    expect(readDocument).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/filled 1/i)).toBeTruthy();
  });

  // The MCAS form carries several hundred VAIR options, and a role query computes every
  // element's accessible name on each poll: these buttons are found by their text instead.
  it("asks first on a form with answers, and applies only when a button is pressed", async () => {
    readDocument.mockResolvedValue({
      ok: true,
      values: { systemName: "From the doc" },
      filled: ["systemName"],
      kept: [],
      model: null,
      risks: null,
      risksKept: false,
      risksProposed: 0,
    });
    const { container } = mount(findExample("mcas")!);
    const before = field(container, "systemName").value;
    pick();
    const replace = await screen.findByText(/replace/i, { selector: "button" });
    expect(field(container, "systemName").value).toBe(before);

    fireEvent.click(replace);
    await waitFor(() => expect(field(container, "systemName").value).toBe("From the doc"));
    const [, second] = readDocument.mock.calls;
    expect((second[1] as FormData).get("mode")).toBe("replace");
  });

  it("shows the reader's message for a file it cannot read, and changes nothing", async () => {
    readDocument.mockResolvedValue({ ok: false, error: "exe is not a format this reads" });
    const { container } = mount(findExample("mcas")!);
    const before = field(container, "systemName").value;
    pick();
    expect(await screen.findByText(/not a format this reads/i)).toBeTruthy();
    expect(field(container, "systemName").value).toBe(before);
    expect(screen.queryByText(/replace/i, { selector: "button" })).toBeNull();
  });
});

const docRisk = (risk: string) => ({
  risk,
  source: "a cause",
  vulnerability: "",
  consequence: "a result",
  affected: "user",
  areas: ["right", "safety"],
  control: "a control",
  followUpControl: "",
});

describe("uploading risks", () => {
  it("puts one row per risk in the document on an empty form", async () => {
    readDocument.mockResolvedValue({
      ok: true,
      values: {},
      filled: [],
      kept: [],
      model: null,
      risks: [docRisk("first"), docRisk("second")],
      risksKept: false,
      risksProposed: 2,
    });
    const { container } = mount();
    pick();
    await waitFor(() => expect(container.querySelectorAll("fieldset.qf-risk").length).toBe(2));
    const rows = container.querySelectorAll("fieldset.qf-risk");
    expect((rows[1].querySelector('[name$=":risk"]') as HTMLTextAreaElement).value).toBe("second");
    expect((rows[0].querySelector('[name$=":affected"]') as HTMLSelectElement).value).toBe("user");
    const areas = [...rows[0].querySelectorAll('input[type="hidden"][name$=":area"]')].map(
      (i) => (i as HTMLInputElement).value,
    );
    expect(areas).toEqual(["right", "safety"]);
    expect(screen.getByText(/2 risks/i)).toBeTruthy();
  });

  it("sends the rows the form holds, so the service can keep them", async () => {
    readDocument.mockResolvedValue({ ok: false, error: "stop here" });
    mount(findExample("mcas")!);
    pick();
    await screen.findByText(/stop here/);
    const sent = JSON.parse((readDocument.mock.calls[0][1] as FormData).get("current_risks") as string);
    expect(sent.length).toBe(findExample("mcas")!.risks.length);
    expect(sent[0].risk).toMatch(/wrongly ranked as high risk/);
  });

  it("leaves the rows alone when the service says to keep them", async () => {
    readDocument.mockResolvedValue({
      ok: true,
      values: { systemName: "From the doc" },
      filled: ["systemName"],
      kept: [],
      model: null,
      risks: null,
      risksKept: true,
      risksProposed: 2,
    });
    const example = findExample("mcas")!;
    const { container } = mount(example);
    pick();
    fireEvent.click(await screen.findByText(/only the empty/i, { selector: "button" }));
    await screen.findByText(/risks as they were/i);
    const rows = container.querySelectorAll("fieldset.qf-risk");
    expect(rows.length).toBe(example.risks.length);
    expect((rows[0].querySelector('[name$=":risk"]') as HTMLTextAreaElement).value).toMatch(
      /wrongly ranked as high risk/,
    );
  });
});

describe("uploading components", () => {
  const docPart = (name: string, type = "DecisionTree") => ({ key: "", name, role: "r", type, provider: "in_house", providerName: "" });

  it("puts one row per component in the document on an empty form", async () => {
    readDocument.mockResolvedValue({
      ok: true, values: {}, filled: [], kept: [], model: null,
      risks: null, risksKept: false, risksProposed: 0,
      components: [docPart("Scoring model"), docPart("Policy-rule engine", "rule_engine")],
      componentsKept: false, componentsProposed: 2,
    });
    const { container } = mount();
    pick();
    await waitFor(() => expect(container.querySelectorAll("fieldset.qf-component").length).toBe(2));
    const rows = container.querySelectorAll("fieldset.qf-component");
    expect((rows[1].querySelector('[name$=":name"]') as HTMLInputElement).value).toBe("Policy-rule engine");
    expect((rows[1].querySelector('[name$=":type"]') as HTMLSelectElement).value).toBe("rule_engine");
    expect(screen.getByText(/2 components/i)).toBeTruthy();
  });

  it("sends the component rows the form holds, so the service can keep them", async () => {
    readDocument.mockResolvedValue({ ok: false, error: "stop here" });
    const { container } = mount();
    fireEvent.click(screen.getByRole("button", { name: /add a component/i }));
    fireEvent.change(container.querySelector('[name="component:0:name"]')!, { target: { value: "typed part" } });
    pick();
    await screen.findByText(/stop here/);
    const sent = JSON.parse((readDocument.mock.calls[0][1] as FormData).get("current_components") as string);
    expect(sent.map((r: { name: string }) => r.name)).toEqual(["typed part"]);
  });

  it("shows each block once when the document brings both risks and components", async () => {
    // Regression guard: if both blocks number their rows from 1 they share keys,
    // and the page shows the Components block three times, empty.
    readDocument.mockResolvedValue({
      ok: true, values: {}, filled: [], kept: [], model: null,
      risks: [docRisk("first")], risksKept: false, risksProposed: 1,
      components: [docPart("Scoring model")], componentsKept: false, componentsProposed: 1,
    });
    const { container } = mount();
    pick();
    await waitFor(() => expect(container.querySelectorAll("fieldset.qf-component").length).toBe(1));
    const headings = [...container.querySelectorAll("h2")].map((h) => (h.textContent ?? "").split(" ")[0]);
    expect(headings.filter((h) => h === "Components")).toHaveLength(1);
    expect(headings.filter((h) => h === "Risks")).toHaveLength(1);
    expect(container.querySelectorAll("fieldset.qf-risk:not(.qf-component)").length).toBe(1);
  });
});

// The document can name the VAIR picks too (system type, purpose and the four tag sets).
describe("uploading the VAIR picks", () => {
  const PICKS = {
    systemType: "NarrowAI", purpose: "AssessingCreditworthiness",
    targetSystemTags: ["Profiling", "QuestionAnswering"], sectorTags: ["PrivateService"],
    marketFormTags: ["Software", "Service"], localityTags: ["Workplace"],
  };
  const withPicks = (picks: object = PICKS) => ({
    ok: true, values: {}, filled: [], kept: [], model: null,
    risks: null, risksKept: false, risksProposed: 0, components: null, componentsKept: false, componentsProposed: 0,
    picks, picksProposed: Object.keys(picks).length,
  });
  const hidden = (c: HTMLElement, name: string) =>
    [...c.querySelectorAll(`input[type="hidden"][name="${name}"]`)].map((i) => (i as HTMLInputElement).value);
  const select = (c: HTMLElement, name: string) => (c.querySelector(`select[name="${name}"]`) as HTMLSelectElement).value;

  it("puts every pick on an empty form, and says so", async () => {
    readDocument.mockResolvedValue(withPicks());
    const { container } = mount();
    pick();
    await waitFor(() => expect(hidden(container, "sectorTags")).toEqual(["PrivateService"]));
    expect(select(container, "systemType")).toBe("NarrowAI");
    expect(select(container, "purpose")).toBe("AssessingCreditworthiness");
    expect(hidden(container, "targetSystemTags")).toEqual(["Profiling", "QuestionAnswering"]);
    expect(hidden(container, "marketFormTags")).toEqual(["Software", "Service"]);
    expect(hidden(container, "localityTags")).toEqual(["Workplace"]);
    expect(screen.getByText(/6 choices from the lists/)).toBeTruthy();
  });

  it("with only the empty ones, keeps what the author already chose", async () => {
    readDocument.mockResolvedValue(withPicks());
    const { container } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Employment" }));
    fireEvent.change(container.querySelector('select[name="systemType"]')!, { target: { value: "ExpertSystem" } });
    fireEvent.change(container.querySelector('[name="systemName"]')!, { target: { value: "typed" } });
    pick();
    fireEvent.click(await screen.findByText(/only the empty/i, { selector: "button" }));
    await waitFor(() => expect(hidden(container, "localityTags")).toEqual(["Workplace"]));
    expect(hidden(container, "sectorTags")).toEqual(["Employment"]);
    expect(select(container, "systemType")).toBe("ExpertSystem");
    expect(select(container, "purpose")).toBe("AssessingCreditworthiness");
  });

  it("replacing puts the document's picks in place of the author's", async () => {
    readDocument.mockResolvedValue(withPicks());
    const { container } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Employment" }));
    fireEvent.change(container.querySelector('[name="systemName"]')!, { target: { value: "typed" } });
    pick();
    fireEvent.click(await screen.findByText(/replace/i, { selector: "button" }));
    await waitFor(() => expect(hidden(container, "sectorTags")).toEqual(["PrivateService"]));
  });

  it("puts the kind of provider and deployer on their selects, by the same rule", async () => {
    readDocument.mockResolvedValue(withPicks({ providerTerm: "PublicAuthority", deployerTerm: "EducationalInstitution" }));
    const { container } = mount();
    fireEvent.change(container.querySelector('select[name="providerTerm"]')!, { target: { value: "Police" } });
    fireEvent.change(container.querySelector('[name="systemName"]')!, { target: { value: "typed" } });
    pick();
    fireEvent.click(await screen.findByText(/only the empty/i, { selector: "button" }));
    await waitFor(() => expect(select(container, "deployerTerm")).toBe("EducationalInstitution"));
    expect(select(container, "providerTerm")).toBe("Police");
  });

  it("replacing puts the document's kind of deployer in place of the author's", async () => {
    readDocument.mockResolvedValue(withPicks({ deployerTerm: "EducationalInstitution" }));
    const { container } = mount();
    fireEvent.change(container.querySelector('select[name="deployerTerm"]')!, { target: { value: "Police" } });
    fireEvent.change(container.querySelector('[name="systemName"]')!, { target: { value: "typed" } });
    pick();
    fireEvent.click(await screen.findByText(/replace/i, { selector: "button" }));
    await waitFor(() => expect(select(container, "deployerTerm")).toBe("EducationalInstitution"));
  });

  it("a VAIR group from the document lands on a risk's affected select", async () => {
    readDocument.mockResolvedValue({
      ok: true, values: {}, filled: [], kept: [], model: null,
      risks: [{ ...docRisk("first"), affected: "JobApplicant" }], risksKept: false, risksProposed: 1,
    });
    const { container } = mount();
    pick();
    await waitFor(() =>
      expect((container.querySelector('[name$=":affected"]') as HTMLSelectElement).value).toBe("JobApplicant"),
    );
  });

  it("a document with only picks is something to use", async () => {
    readDocument.mockResolvedValue(withPicks({ localityTags: ["Workplace"] }));
    const { container } = mount();
    pick();
    await waitFor(() => expect(hidden(container, "localityTags")).toEqual(["Workplace"]));
  });
});
