// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { redirect } from "next/navigation";

// Calling a server action from a component: src/lib/serverAction.ts.
//   runAction(action) -> {ok: true, value} | {ok: false, error, value?}
// maps a returned {error} (passed on as it is, with the value), a throw and a rejection (one
// plain sentence, ACTION_FAILED) to one answer, and never throws, except for Next's own
// redirect, which goes on to the router.
//   useServerAction() -> {run, busy, error, setError} wraps it for a component.

const load = async () => import("@/lib/serverAction");
const TRY_AGAIN = "This could not be done just now. Try again.";

describe("runAction", () => {
  it("a success gives the action's value", async () => {
    const { runAction } = await load();
    expect(await runAction(async () => ({ ok: true, id: 3 }))).toEqual({ ok: true, value: { ok: true, id: 3 } });
    expect(await runAction(async () => undefined)).toEqual({ ok: true, value: undefined });
  });

  it("a returned {error} is passed on as it is, with what the action returned", async () => {
    const { runAction } = await load();
    const returned = { ok: false, error: "Give the question set a name.", missing: ["x"] };
    expect(await runAction(async () => returned)).toEqual({
      ok: false,
      error: "Give the question set a name.",
      value: returned,
    });
  });

  it("a throw or a rejection is one plain sentence, not the exception's text", async () => {
    const { runAction, ACTION_FAILED } = await load();
    expect(ACTION_FAILED).toBe(TRY_AGAIN);
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      await runAction(async () => {
        throw new Error("connect ECONNREFUSED 10.0.0.4:5432");
      }),
    ).toEqual({ ok: false, error: TRY_AGAIN });
    expect(await runAction(() => Promise.reject(new TypeError("Failed to fetch")))).toEqual({
      ok: false,
      error: TRY_AGAIN,
    });
    quiet.mockRestore();
  });

  it("Next's redirect goes on to the router", async () => {
    const { runAction } = await load();
    await expect(
      runAction(async () => {
        redirect("/p/mcas/question-sets");
      }),
    ).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT/) });
  });
});

describe("useServerAction", () => {
  it("is busy while the action runs, and keeps its error until the next run", async () => {
    const { useServerAction } = await load();
    const { result } = renderHook(() => useServerAction());
    let finish: (v: { error?: string }) => void = () => {};
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.run(() => new Promise<{ error?: string }>((r) => (finish = r)));
    });
    expect(result.current.busy).toBe(true);
    await act(async () => {
      finish({ error: "Taken." });
      await pending;
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBe("Taken.");
    await act(async () => {
      await result.current.run(async () => ({}));
    });
    expect(result.current.error).toBeNull();
  });
});
