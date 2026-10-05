// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { loadSrc } from "../support/forms";

// The retire button: src/app/p/[project]/RetireButton.tsx, props {name, action}. A ghost "Retire" that asks
// once before it calls the action; the action's {error} shows in div.error. Loaded at run time
// so a missing module fails each test, not the file.

afterEach(cleanup);

async function mount(
  action: () => Promise<{ error?: string } | void>,
  name = "Acme AI policy",
) {
  const { default: RetireButton } = await loadSrc(
    "app/p/[project]/RetireButton.tsx",
  );
  return render(<RetireButton name={name} action={action} />);
}

const CONFIRM =
  "Retire Acme AI policy? Cards and questionnaires that use it keep it.";

describe("the retire button (T56)", () => {
  it("T56 renders one ghost button Retire and calls nothing yet", async () => {
    const action = vi.fn(async () => undefined);
    await mount(action);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Retire"]);
    expect(buttons[0].classList.contains("btn")).toBe(true);
    expect(buttons[0].classList.contains("ghost")).toBe(true);
    expect(document.body.textContent).not.toContain(CONFIRM);
    expect(action).not.toHaveBeenCalled();
  });

  it("T56 pressing it replaces it with the question and the buttons Retire and Cancel", async () => {
    const action = vi.fn(async () => undefined);
    await mount(action);
    fireEvent.click(screen.getByRole("button", { name: "Retire" }));
    expect(document.body.textContent).toContain(CONFIRM);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Retire",
      "Cancel",
    ]);
    expect(action).not.toHaveBeenCalled();
  });

  it("T56 the second Retire calls the action once", async () => {
    const action = vi.fn(async () => undefined);
    await mount(action);
    fireEvent.click(screen.getByRole("button", { name: "Retire" }));
    fireEvent.click(screen.getByRole("button", { name: "Retire" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  });

  it("T56 Cancel restores the single Retire button without calling the action", async () => {
    const action = vi.fn(async () => undefined);
    await mount(action);
    fireEvent.click(screen.getByRole("button", { name: "Retire" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(document.body.textContent).not.toContain(CONFIRM);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Retire",
    ]);
    expect(action).not.toHaveBeenCalled();
  });

  it("T56 an {error} from the action shows in div.error", async () => {
    const action = vi.fn(async () => ({
      error: "Annex IV cannot be retired.",
    }));
    const { container } = await mount(action);
    fireEvent.click(screen.getByRole("button", { name: "Retire" }));
    fireEvent.click(screen.getByRole("button", { name: "Retire" }));
    await waitFor(() =>
      expect(container.querySelector("div.error")?.textContent).toBe(
        "Annex IV cannot be retired.",
      ),
    );
  });

  it("T56 the question names the thing retired", async () => {
    await mount(
      vi.fn(async () => undefined),
      "Annex IV default",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retire" }));
    expect(document.body.textContent).toContain(
      "Retire Annex IV default? Cards and questionnaires that use it keep it.",
    );
  });
});
