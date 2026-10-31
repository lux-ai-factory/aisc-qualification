import { describe, expect, it, vi } from "vitest";

import { PlatformClient } from "@/server/services/PlatformClient";

// A platform failure reaches the person as the error's message, so the message says what
// the app was doing: only saving a card version names the system.

const down = () =>
  vi.fn().mockRejectedValue(new TypeError("fetch failed")) as unknown as typeof fetch;
const answers = (status: number) =>
  vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ detail: "nope" }), { status }),
  ) as unknown as typeof fetch;
const client = (fetchImpl: typeof fetch) =>
  new PlatformClient("http://platform:8000", fetchImpl);
const messageOf = (p: Promise<unknown>) => p.then(() => "", (e: Error) => e.message);

describe("PlatformClient's error messages", () => {
  it("saving a version names the system", async () => {
    expect(await messageOf(client(down()).createVersion("p1", { name: "MCAS" }))).toBe(
      "Could not name this system: the platform did not answer.",
    );
  });

  it("reading the versions says it was reading the versions", async () => {
    expect(await messageOf(client(down()).latestVersion("p1"))).toBe(
      "Could not read the AI card versions: the platform did not answer.",
    );
    expect(await messageOf(client(answers(500)).listVersions("p1"))).toBe(
      "Could not read the AI card versions: the platform answered 500. nope",
    );
  });

  it("syncing the targets says it was updating the targets", async () => {
    expect(await messageOf(client(answers(403)).syncTargets("p1"))).toBe(
      "Could not update the assessment targets: the platform answered 403. nope",
    );
  });
});
