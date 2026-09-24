// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { readDocument } = vi.hoisted(() => ({ readDocument: vi.fn() }));
vi.mock("@/app/p/[project]/qualify/new/prefill-actions", () => ({ readDocument }));
vi.mock("@/app/p/[project]/qualify/new/actions", () => ({ submitQualification: vi.fn() }));

import QualifyForm from "@/app/p/[project]/qualify/new/QualifyForm";
import { findExample } from "@/data/examples";
import { sectors, targetSystems } from "@/data";
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
      targetSystems={targetSystems}
      sectors={sectors}
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
    const replace = await screen.findByRole("button", { name: /replace/i });
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
    expect(screen.queryByRole("button", { name: /replace/i })).toBeNull();
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
    fireEvent.click(await screen.findByRole("button", { name: /only the empty/i }));
    await screen.findByText(/risks as they were/i);
    const rows = container.querySelectorAll("fieldset.qf-risk");
    expect(rows.length).toBe(example.risks.length);
    expect((rows[0].querySelector('[name$=":risk"]') as HTMLTextAreaElement).value).toMatch(
      /wrongly ranked as high risk/,
    );
  });
});
