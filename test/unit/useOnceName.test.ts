import { describe, it, expect } from "vitest";
import { resolve } from "node:path";

// The name of a use-once form.
//   useOnceFormName(systemName: string, today: Date, taken: string[]): string
// in src/domain/forms/useOnceName.ts, pure.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = async (): Promise<any> =>
  (await import(/* @vite-ignore */ resolve("src/domain/forms/useOnceName.ts")))
    .useOnceFormName;

const DAY = new Date("2026-09-25T23:30:00Z");

describe("useOnceFormName (R67)", () => {
  it("R67 is Custom questions: <system>, <UTC date>", async () => {
    const name = await load();
    expect(name("MCAS", DAY, [])).toBe("Custom questions: MCAS, 2026-09-25");
  });

  it("R67 the date is UTC, whatever the offset the Date was made with", async () => {
    const name = await load();
    expect(name("MCAS", new Date("2026-09-26T00:30:00+02:00"), [])).toBe(
      "Custom questions: MCAS, 2026-09-25",
    );
    expect(name("MCAS", new Date("2026-01-02T00:00:00Z"), [])).toBe(
      "Custom questions: MCAS, 2026-01-02",
    );
  });

  it("R67 a taken name, compared ignoring case after trim, gets (2), then (3)", async () => {
    const name = await load();
    expect(name("MCAS", DAY, ["custom questions: mcas, 2026-09-25"])).toBe(
      "Custom questions: MCAS, 2026-09-25 (2)",
    );
    expect(
      name("MCAS", DAY, [
        "  Custom questions: MCAS, 2026-09-25  ",
        "CUSTOM QUESTIONS: MCAS, 2026-09-25 (2)",
      ]),
    ).toBe("Custom questions: MCAS, 2026-09-25 (3)");
  });

  it("R67 the smallest free n from 2 is used, so a gap is filled", async () => {
    const name = await load();
    expect(
      name("MCAS", DAY, [
        "Custom questions: MCAS, 2026-09-25",
        "Custom questions: MCAS, 2026-09-25 (3)",
      ]),
    ).toBe("Custom questions: MCAS, 2026-09-25 (2)");
  });

  it("R67 a numbered name taken while the base is free leaves the base", async () => {
    const name = await load();
    expect(
      name("MCAS", DAY, [
        "Custom questions: MCAS, 2026-09-25 (2)",
        "Custom questions",
      ]),
    ).toBe("Custom questions: MCAS, 2026-09-25");
  });

  it("R67 whitespace in the system name is collapsed and trimmed; empty is unnamed system", async () => {
    const name = await load();
    expect(name("  Micro   Credit\n Score ", DAY, [])).toBe(
      "Custom questions: Micro Credit Score, 2026-09-25",
    );
    expect(name("   ", DAY, [])).toBe(
      "Custom questions: unnamed system, 2026-09-25",
    );
    expect(name("", DAY, [])).toBe(
      "Custom questions: unnamed system, 2026-09-25",
    );
  });

  it("R67 the system name is cut to 80 characters, then trimmed at the end", async () => {
    const name = await load();
    const long = "x".repeat(79) + " " + "y".repeat(30);
    expect(name(long, DAY, [])).toBe(
      `Custom questions: ${"x".repeat(79)}, 2026-09-25`,
    );
    expect(name("z".repeat(100), DAY, [])).toBe(
      `Custom questions: ${"z".repeat(80)}, 2026-09-25`,
    );
  });

  it("R67 the longest result, an 80-character name with (999), is 116 characters, inside the 120 limit", async () => {
    const name = await load();
    const system = "s".repeat(80);
    const base = `Custom questions: ${system}, 2026-09-25`;
    const taken = [
      base,
      ...Array.from({ length: 997 }, (_, i) => `${base} (${i + 2})`),
    ];
    const out = name(system, DAY, taken);
    expect(out).toBe(`${base} (999)`);
    expect(out.length).toBe(116);
  });

  it("R67 it is pure: the taken list is not changed", async () => {
    const name = await load();
    const taken = ["Custom questions: MCAS, 2026-09-25"];
    name("MCAS", DAY, taken);
    expect(taken).toEqual(["Custom questions: MCAS, 2026-09-25"]);
  });
});
