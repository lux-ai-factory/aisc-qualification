// The form's save action and its qualification.created event: what the new card was made from,
// and, for a next version, what it took from the review of the card before it. The counts go in
// details (the platform registry lists their keys); the node ids in content.review.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreatedCard } from "@/server/services/QualificationService";

const m = vi.hoisted(() => ({
  emitEvent: vi.fn(async () => null),
  card: null as unknown,
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/lib/projectDb", () => ({
  projectDbForAction: async () => ({ db: {} }),
}));
vi.mock("@/vendor/aisc-ledger/emit", () => ({ emitEvent: m.emitEvent }));
vi.mock("@/server/services/QualificationService", () => ({
  qualificationService: {
    createFromForm: vi.fn(
      async (_p: string, _f: FormData, record: (tx: unknown, c: unknown) => Promise<unknown>) => {
        await record({}, m.card);
        return { id: "card-4" };
      },
    ),
  },
}));

const input = {
  questionnaireVersionId: "annex-iv-default-v1",
  risks: [{}, {}],
  systemComponents: [{}],
} as unknown as CreatedCard["input"];

async function save(card: CreatedCard) {
  m.card = card;
  const { submitQualification } = await import(
    "@/app/p/[project]/qualify/new/actions"
  );
  await submitQualification("mcas", undefined, new FormData()).catch((e: Error) => {
    if (e.message !== "NEXT_REDIRECT") throw e;
  });
  return (m.emitEvent.mock.calls.at(-1) as unknown as [unknown, Record<string, unknown>])[1];
}

beforeEach(() => m.emitEvent.mockClear());

describe("qualification.created", () => {
  it("a first card says what it was made from, and nothing about a review", async () => {
    const event = await save({ id: "card-1", input, review: null });
    expect(event.details).toEqual({
      questionnaire_version: "annex-iv-default-v1",
      risks: 2,
      components: 1,
    });
    expect(event.content).toEqual(input);
  });

  it("a next version also says what it took from the review of the card before it", async () => {
    const review = {
      from_version: 3,
      carried: ["risk0", "purpose"],
      left: ["risk1"],
      draft: "left" as const,
    };
    const event = await save({ id: "card-4", input, review });
    expect(event.details).toEqual({
      questionnaire_version: "annex-iv-default-v1",
      risks: 2,
      components: 1,
      review_from_version: 3,
      corrections_carried: 2,
      corrections_left: 1,
      draft: "left",
      review_failed: false,
    });
    expect(event.content).toEqual({ ...input, review });
  });

  it("a review that could not be carried says so", async () => {
    const review = {
      from_version: 3,
      carried: [],
      left: ["risk0"],
      draft: "none" as const,
      failed: "Ontology service error 503",
    };
    const event = await save({ id: "card-4", input, review });
    expect(event.details).toMatchObject({ corrections_left: 1, review_failed: true });
  });
});
