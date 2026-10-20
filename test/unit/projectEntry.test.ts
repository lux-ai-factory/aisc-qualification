import { describe, it, expect, vi } from "vitest";

// The launcher's Qualify card opens /p/{project}: it goes straight to the AI system, which opens
// the latest AI card (its left menu) or the form for the first one. No welcome page in between.
const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
}));
vi.mock("next/navigation", () => ({ redirect }));

import ProjectEntry from "@/app/p/[project]/page";

describe("a project's way in", () => {
  it("goes straight to the AI system", async () => {
    await expect(ProjectEntry({ params: Promise.resolve({ project: "mcas" }) })).rejects.toMatchObject({
      url: "/p/mcas/system",
    });
    expect(redirect).toHaveBeenCalledWith("/p/mcas/system");
  });
});
