import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

// A card save or correction that fails answers the form with a readable reason,
// whatever the failure: it never throws out of the action, which would replace the
// filled form with the generic application-error page and lose what was typed.

const { qualificationService, redirect } = vi.hoisted(() => ({
  qualificationService: {
    createFromForm: vi.fn(),
    reviseFromForm: vi.fn(),
  },
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect, notFound: vi.fn() }));
vi.mock("@/lib/projectDb", () => ({
  projectDbForAction: async () => ({ db: {} }),
  projectDbPastDoor: async () => ({}),
}));
vi.mock("@/vendor/aisc-ledger/emit", () => ({ emitEvent: vi.fn() }));
vi.mock("@/server/services/QualificationService", () => ({
  QualificationService: class {},
  CardNotSaved: class CardNotSaved extends Error {
    constructor(readonly version: "withdrawn" | "none" | "unknown") {
      super("card not saved");
    }
  },
  qualificationService,
}));

const submit = async (fields: Record<string, string>) => {
  const { submitQualification } = await import(
    "@/app/p/[project]/qualify/new/actions"
  );
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return submitQualification("mcas", undefined, fd);
};

beforeEach(() => vi.clearAllMocks());

describe("a failed card save keeps the form and says why", () => {
  it("a correction the platform refuses answers the form with the reason", async () => {
    qualificationService.reviseFromForm.mockRejectedValue(
      new Error(
        "Could not correct this system: the platform answered 422 (the reason is required)",
      ),
    );
    const out = await submit({
      change: "correction",
      amendReason: "typo",
      amendRequestedBy: "provider",
    }).catch((err: unknown) => ({ thrown: String(err) }));
    expect(out, "the action threw instead of answering the form").not.toHaveProperty(
      "thrown",
    );
    expect((out as { error?: string })?.error).toMatch(/reason is required/);
  });

  it("a correction the platform counted but the card store refused answers the form", async () => {
    qualificationService.reviseFromForm.mockRejectedValue(
      new Error("the platform counted card revision 3 but this card is revision 2"),
    );
    const out = await submit({ change: "correction" }).catch((err: unknown) => ({
      thrown: String(err),
    }));
    expect(out, "the action threw instead of answering the form").not.toHaveProperty(
      "thrown",
    );
    expect((out as { error?: string })?.error ?? "").not.toBe("");
  });

  it("an unexpected failure of a new version answers with a short sentence, not the raw error", async () => {
    qualificationService.createFromForm.mockRejectedValue(
      new TypeError("Cannot read properties of undefined (reading 'id')"),
    );
    const out = await submit({ change: "system" }).catch((err: unknown) => ({
      thrown: String(err),
    }));
    expect(out, "the action threw instead of answering the form").not.toHaveProperty(
      "thrown",
    );
    const error = (out as { error?: string })?.error ?? "";
    expect(error).not.toBe("");
    expect(error).not.toMatch(/Cannot read properties/);
  });

  it("the app has an error page of its own as a backstop", () => {
    const root = join(__dirname, "../../src/app");
    expect(
      existsSync(join(root, "error.tsx")) ||
        existsSync(join(root, "p/[project]/error.tsx")),
      "no error.tsx under src/app",
    ).toBe(true);
  });
});
