import { describe, it, expect, vi } from "vitest";
import { QualificationService } from "@/server/services/QualificationService";
import { defaultVersionLiteral } from "../support/forms";
import { transactional } from "../support/ledgerRepo";

// Saving the form makes the next card version, and that card starts with what the review of
// the card before it still says (OntologyService.reviewToCarry decides what): the carried
// corrections and draft are stored with the new card, in its own transaction, with a history
// row saying what came along and what stayed behind, and the card's ledger event says so too.
// The review is worked out before anything is stored; a builder that cannot answer does not
// stop the save, and the card says its review stayed on the version before.

const version = (number: number) => ({
  pid: `v${number}`,
  number,
  project_id: "core-project-1",
  name: "Acme Vision",
  version: "1.0",
  provider: null,
  description: null,
  created_at: "2026-10-18T09:00:00Z",
  created_by: null,
});

const parsed = {
  systemName: "Acme Vision",
  systemVersion: "1.0",
  company: "Acme",
  description: "A vision system.",
  targetUseCase: "",
  targetUsers: "",
  intendedDeployers: null,
  targetSystemTags: [],
  sectorTags: [],
  marketFormTags: [],
  localityTags: [],
  answers: [{ toolId: "t", questionId: "q1", answer: "Kept answer" }],
  risks: [],
};

const before = {
  id: "card-1",
  systemId: "v1",
  ...parsed,
  answers: [{ id: "a1", toolId: "t", questionId: "q1", answer: "Kept answer" }],
  components: [],
  systemComponents: [],
  questionnaireVersionId: null,
  ontologyPatch: { risk0: { vair: "Bias" } },
  ontologyExtracted: { techniques: ["boosting"] },
};

const carried = {
  patch: { risk0: { vair: "Bias" } },
  extracted: null,
  carried: ["risk0"],
  left: ["risk1"],
  draft: "left" as const,
};

function setup(opts: { first?: boolean; review?: () => Promise<unknown> } = {}) {
  const platform = {
    createVersion: vi.fn(async () => version(opts.first ? 1 : 2)),
    listVersions: vi.fn(async () => (opts.first ? [] : [version(1)])),
    syncTargets: vi.fn(async () => undefined),
  };
  const repo = transactional({
    create: vi.fn(async () => ({ id: "card-2" })),
    cardRefs: vi.fn(async () => (opts.first ? [] : [{ id: "card-1", systemId: "v1" }])),
    find: vi.fn(async (id: string) => (id === "card-1" ? before : null)),
    recordHistory: vi.fn(async () => undefined),
  });
  const review = {
    reviewToCarry: vi.fn(opts.review ?? (async () => carried)),
  };
  const svc = new (QualificationService as unknown as new (
    ...args: unknown[]
  ) => QualificationService)(
    repo,
    { parse: vi.fn(() => ({ ...parsed })) },
    platform,
    async () => ({ resolve: async () => defaultVersionLiteral() }),
    review,
  );
  const recorded: unknown[] = [];
  const record = vi.fn(async (_tx: unknown, card: unknown) => {
    recorded.push(card);
  });
  return { svc, repo, review, record, recorded };
}

describe("the next card version starts with the review of the card before it", () => {
  it("asks what comes along from the card before, with the next card's content, before storing anything", async () => {
    const { svc, review, repo, record } = setup();
    let createdFirst = false;
    review.reviewToCarry.mockImplementation(async () => {
      createdFirst = repo.create.mock.calls.length > 0;
      return carried;
    });
    await svc.createFromForm("mcas", new FormData(), record);
    expect(createdFirst).toBe(false);
    const [project, from, next] = review.reviewToCarry.mock.calls[0] as unknown as [
      string,
      { id: string },
      { systemName: string; answers: unknown[] },
    ];
    expect(project).toBe("mcas");
    expect(from.id).toBe("card-1");
    expect(next.systemName).toBe("Acme Vision");
    expect(next.answers).toEqual([{ toolId: "t", questionId: "q1", answer: "Kept answer" }]);
  });

  it("stores the carried corrections and draft with the card, a history row, and says so in the event", async () => {
    const { svc, repo, record, recorded } = setup();
    await svc.createFromForm("mcas", new FormData(), record);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ ontologyPatch: carried.patch }),
    );
    // the draft stayed behind: the card is stored without one
    expect(repo.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ ontologyExtracted: expect.anything() }),
    );
    expect(repo.recordHistory).toHaveBeenCalledWith({
      qualificationId: "card-2",
      kind: "review_carried",
      subject: "card-1",
      after: { from_version: 1, carried: ["risk0"], left: ["risk1"], draft: "left" },
    });
    expect(recorded[0]).toMatchObject({
      id: "card-2",
      review: { from_version: 1, carried: ["risk0"], left: ["risk1"], draft: "left" },
    });
  });

  it("a first card has nothing to carry: nothing is asked, and no history row is written", async () => {
    const { svc, repo, review, record, recorded } = setup({ first: true });
    await svc.createFromForm("mcas", new FormData(), record);
    expect(review.reviewToCarry).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ ontologyPatch: expect.anything() }),
    );
    expect(repo.recordHistory).not.toHaveBeenCalled();
    expect(recorded[0]).toMatchObject({ review: null });
  });

  it("a builder that cannot answer does not stop the save: the review stays on the card before, and the card says so", async () => {
    const { svc, repo, record, recorded } = setup({
      review: async () => {
        throw new Error("Ontology service error 503: down");
      },
    });
    await expect(svc.createFromForm("mcas", new FormData(), record)).resolves.toEqual({
      id: "card-2",
    });
    expect(repo.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ ontologyPatch: expect.anything() }),
    );
    const failed = {
      from_version: 1,
      carried: [],
      left: ["risk0"],
      draft: "left",
      failed: "Ontology service error 503: down",
    };
    expect(repo.recordHistory).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "review_carried", after: failed }),
    );
    expect(recorded[0]).toMatchObject({ review: failed });
  });
});

describe("reading what a card version took from the one before", () => {
  it("is the card's review_carried row: the review, and the card it came from", async () => {
    const { svc, repo } = setup();
    const said = { from_version: 1, carried: ["risk0"], left: [], draft: "none" };
    (repo as unknown as { history: unknown }).history = vi.fn(async () => [
      { kind: "node_corrected", subject: "risk0", after: {} },
      { kind: "review_carried", subject: "card-1", after: said },
    ]);
    await expect(svc.carriedReview("mcas", "card-2")).resolves.toEqual({
      review: said,
      fromCardId: "card-1",
    });
  });

  it("a first card, or one saved before reviews were carried, took nothing: null", async () => {
    const { svc, repo } = setup();
    (repo as unknown as { history: unknown }).history = vi.fn(async () => []);
    await expect(svc.carriedReview("mcas", "card-1")).resolves.toBeNull();
  });
});
