// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const { submitQualification } = vi.hoisted(() => ({
  submitQualification: vi.fn(),
}));
vi.mock("@/app/p/[project]/qualify/new/prefill-actions", () => ({
  readDocument: vi.fn(),
}));
vi.mock("@/app/p/[project]/qualify/new/actions", () => ({
  submitQualification,
}));

import QualifyForm from "@/app/p/[project]/qualify/new/QualifyForm";

// A save the server refuses (for example "Pick at least one target-system capability.")
// must leave every field as it was. A <form action={fn}> is reset by React when the action
// finishes, whatever it returned, and the fields are uncontrolled (the document prefill
// writes onto them), so without care a refusal erases everything typed or prefilled.

afterEach(() => {
  cleanup();
  submitQualification.mockReset();
});

describe("a refused save keeps what was filled in", () => {
  it("shows the server's message and every typed value is still there", async () => {
    submitQualification.mockResolvedValue({
      error: "Pick at least one target-system capability.",
    });
    const { container } = render(<QualifyForm project="mcas" />);
    const form = container.querySelector(
      "form.qualify-form:not(.qualify-prefill)",
    ) as HTMLFormElement;
    const name = form.elements.namedItem("systemName") as HTMLInputElement;
    const description = form.elements.namedItem(
      "description",
    ) as HTMLTextAreaElement;
    // as the prefill does: written onto the element, not through React
    name.value = "MicroCredit Assist Score (MCAS)";
    description.value = "Credit scoring for short-term consumer loans.";

    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() =>
      expect(
        screen.getByText("Pick at least one target-system capability."),
      ).toBeTruthy(),
    );
    expect(submitQualification).toHaveBeenCalledTimes(1);
    const sent = submitQualification.mock.calls[0].at(-1) as FormData;
    expect(sent.get("systemName")).toBe("MicroCredit Assist Score (MCAS)");
    expect(
      (form.elements.namedItem("systemName") as HTMLInputElement).value,
    ).toBe("MicroCredit Assist Score (MCAS)");
    expect(
      (form.elements.namedItem("description") as HTMLTextAreaElement).value,
    ).toBe("Credit scoring for short-term consumer loans.");
  });
});
