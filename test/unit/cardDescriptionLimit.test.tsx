// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const { readDocument } = vi.hoisted(() => ({ readDocument: vi.fn() }));
vi.mock("@/app/p/[project]/qualify/new/prefill-actions", () => ({
  readDocument,
}));
vi.mock("@/app/p/[project]/qualify/new/actions", () => ({
  submitQualification: vi.fn(),
}));

// The worked example renders several hundred VAIR options, slow to mount in jsdom.
vi.setConfig({ testTimeout: 15_000 });

import QualifyForm from "@/app/p/[project]/qualify/new/QualifyForm";
import { findExample } from "@/data/examples";
import { DESCRIPTION_MAX } from "@/data/formFields";
import {
  QualificationFormParser,
  FormValidationError,
} from "@/server/forms/QualificationFormParser";

// The platform refuses an AI card description above 2000 characters (422 at save). The form
// holds the same limit and shows how much is used, so a person never meets the refusal.

afterEach(cleanup);
beforeEach(() => readDocument.mockReset());

const description = (c: HTMLElement) =>
  c.querySelector<HTMLTextAreaElement>('textarea[name="description"]')!;
const counter = (c: HTMLElement) =>
  c.querySelector('[data-testid="description-count"]')?.textContent;

describe("the AI card description holds the platform's 2000 characters", () => {
  it("is the platform's number", () => {
    expect(DESCRIPTION_MAX).toBe(2000);
  });

  it("the field takes at most 2000 characters", () => {
    const { container } = render(<QualifyForm project="p" />);
    expect(description(container).maxLength).toBe(2000);
  });

  it("an empty field shows 0 / 2000", () => {
    const { container } = render(<QualifyForm project="p" />);
    expect(counter(container)).toBe("0 / 2000");
  });

  it("the count follows what is typed", () => {
    const { container } = render(<QualifyForm project="p" />);
    fireEvent.input(description(container), {
      target: { value: "A".repeat(42) },
    });
    expect(counter(container)).toBe("42 / 2000");
  });

  it("a form opened on an example counts the example's description", () => {
    const { container } = render(
      <QualifyForm project="p" initial={findExample("mcas")!} />,
    );
    const length = description(container).value.length;
    expect(length).toBeGreaterThan(0);
    expect(counter(container)).toBe(`${length} / 2000`);
  });

  it("a description filled in from a document is counted too", async () => {
    readDocument.mockResolvedValue({
      ok: true,
      values: { description: "From the document." },
      filled: ["description"],
      kept: [],
      model: null,
      risks: null,
      risksKept: false,
      risksProposed: 0,
    });
    const { container } = render(<QualifyForm project="p" />);
    fireEvent.change(screen.getByLabelText(/^document$/i), {
      target: { files: [new File(["text"], "doc.md")] },
    });
    await waitFor(() =>
      expect(description(container).value).toBe("From the document."),
    );
    expect(counter(container)).toBe("18 / 2000");
  });
});

describe("a longer description is refused by the form, not by the platform", () => {
  const metadata = (text: string) => {
    const fd = new FormData();
    fd.set("systemName", "Acme Vision");
    fd.set("systemVersion", "1.0");
    fd.set("company", "Acme");
    fd.set("description", text);
    return fd;
  };
  const parseError = (fd: FormData): unknown => {
    try {
      new QualificationFormParser().parse(fd);
    } catch (e) {
      return e;
    }
    return null;
  };

  it("2001 characters are refused with the limit named", () => {
    const err = parseError(metadata("x".repeat(2001)));
    expect(err).toBeInstanceOf(FormValidationError);
    expect((err as Error).message).toBe(
      "The description is at most 2000 characters.",
    );
  });

  it("2000 characters pass the description check", () => {
    const err = parseError(metadata("x".repeat(2000)));
    expect((err as Error | null)?.message ?? "").not.toMatch(/description/i);
  });
});
