// Defence in depth: the project layout asks the read door itself.
// This only proves the layout calls the door. It cannot show that the pages are protected: in
// Next 15 a page is rendered beside its layout, not inside it. That is what
// test/unit/pagesAskTheDoor.test.ts checks, on the card page and on projectDbPastDoor.
import { beforeEach, describe, expect, it, vi } from "vitest";

const PROJECT = "a1b2c3d4-0000-4000-8000-000000000002";

const { door } = vi.hoisted(() => ({ door: vi.fn() }));
vi.mock("@/lib/projectDb", () => ({
  projectDbFor: (p: string, o: { write: boolean }) => door(p, o),
}));
vi.mock("@/components/SiteHeader", () => ({ default: () => null }));

class NotFound extends Error {}

beforeEach(() => {
  door.mockReset();
});

const layout = async () => (await import("@/app/p/[project]/layout")).default;

describe("the project layout asks the read door", () => {
  it("for the project in the path, before rendering the pages under it", async () => {
    door.mockResolvedValue({});
    const Layout = await layout();
    const out = await Layout({
      children: "the page",
      params: Promise.resolve({ project: PROJECT }),
    });
    expect(door).toHaveBeenCalledWith(PROJECT, { write: false });
    expect(JSON.stringify(out)).toContain("the page");
  });

  it("a stranger past the middleware gets the door's refusal, not the page", async () => {
    door.mockRejectedValue(new NotFound("NEXT_NOT_FOUND"));
    const Layout = await layout();
    await expect(
      Layout({
        children: "the page",
        params: Promise.resolve({ project: PROJECT }),
      }),
    ).rejects.toBeInstanceOf(NotFound);
  });
});
