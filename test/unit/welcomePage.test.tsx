// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import WelcomePage from "@/app/p/[project]/page";

// The qualification module's first page, inside a project: its main button
// starts the qualification of the project's AI system.
describe("the welcome page", () => {
  it("offers to qualify the AI system, and opens the system page", async () => {
    render(await WelcomePage({ params: Promise.resolve({ project: "mcas" }) }));
    const button = screen.getByRole("link", { name: "Qualify AI system" });
    expect(button.getAttribute("href")).toBe("/p/mcas/system");
    expect(screen.queryByText("Open the AI system")).toBeNull();
  });
});
