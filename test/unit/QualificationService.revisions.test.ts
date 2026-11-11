import { describe, it, expect, vi } from "vitest";
import { QualificationService } from "@/server/services/QualificationService";
import { PlatformStatusError } from "@/server/services/PlatformClient";
import { FormValidationError } from "@/server/forms/QualificationFormParser";
import { defaultVersionLiteral } from "../support/forms";
import { transactional } from "../support/ledgerRepo";

// A correction keeps the version of the system and makes the next revision of its card.

const version = (number: number, cardRevision = 1) => ({
  pid: `v${number}`,
  number,
  project_id: "core-project-1",
  name: "Acme Vision",
  version: "1.0",
  provider: null,
  description: null,
  created_at: "2026-09-25T09:00:00Z",
  created_by: null,
  cardRevision,
});

const amend = { reason: "Provider name was misspelled", requestedBy: "Acme, email of 10 Nov" };

function parsed(over: Record<string, unknown> = {}) {
  return {
    systemName: "Acme Vision",
    systemVersion: "1.0",
    company: "Acme Corp",
    description: "A vision system.",
    targetUseCase: "",
    targetUsers: "",
    intendedDeployers: null,
    targetSystemTags: [],
    sectorTags: [],
    marketFormTags: [],
    localityTags: [],
    answers: [],
    risks: [],
    systemComponents: [],
    ...over,
  };
}

function setup(opts: { reviseVersion?: () => Promise<unknown>; parsed?: Record<string, unknown> } = {}) {
  const platform = {
    createVersion: vi.fn(async () => version(2)),
    reviseVersion: vi.fn(opts.reviseVersion ?? (async () => version(1, 2))),
    listVersions: vi.fn(async () => [version(1)]),
    syncTargets: vi.fn(async () => undefined),
  };
  const repo = transactional({
    create: vi.fn(async () => ({ id: "card-1b" })),
    cardRefs: vi.fn(async () => [{ id: "card-1", systemId: "v1", revision: 1 }]),
    find: vi.fn(async (id: string) =>
      id === "card-1"
        ? { id: "card-1", systemId: "v1", revision: 1, answers: [], risks: [], systemComponents: [{ key: "k1" }], questionnaireVersionId: null }
        : null,
    ),
  });
  const parser = { parse: vi.fn(() => parsed(opts.parsed)) };
  const formsFor = vi.fn(async () => ({ resolve: vi.fn(async () => defaultVersionLiteral()) }));
  const review = { reviewToCarry: vi.fn(async () => ({ patch: null, extracted: null, carried: [], left: [], draft: "none" })) };
  const engine = { components: vi.fn(async () => []) };
  const svc = new (QualificationService as unknown as new (...a: unknown[]) => QualificationService)(
    repo, parser, platform, formsFor, review, engine,
  );
  return { svc, platform, repo };
}

const posted = (amendsId: string | null = "card-1") => {
  const fd = new FormData();
  if (amendsId !== null) fd.set("amendsId", amendsId);
  return fd;
};
const STALE = "A newer version was saved since this page was opened. Reload it before correcting the description.";

describe("correcting the description of a version", () => {
  it("a correction keeps the version and makes the next revision", async () => {
    const { svc, platform, repo } = setup();
    const record = vi.fn(async () => undefined);
    const out = await svc.reviseFromForm("mcas", posted(), amend, record);
    expect(out).toEqual({ id: "card-1b" });
    expect(platform.reviseVersion).toHaveBeenCalledWith(
      "mcas",
      "v1",
      expect.objectContaining({ name: "Acme Vision", provider: "Acme Corp" }),
      amend,
    );
    expect(platform.createVersion).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        systemId: "v1",
        revision: 2,
        amendsId: "card-1",
        amendReason: amend.reason,
        amendRequestedBy: amend.requestedBy,
      }),
    );
    expect(record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "card-1b", revision: 2, amendsId: "card-1" }),
    );
  });

  it("a correction copies risks and components from the form like a save", async () => {
    const risks = [{ title: "Risk 5" }];
    const systemComponents = [{ key: "k1", name: "Back-end" }];
    const { svc, repo } = setup({ parsed: { risks, systemComponents } });
    await svc.reviseFromForm("mcas", posted(), amend);
    const input = (repo.create.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(input.risks).toEqual(risks);
    expect(input.systemComponents).toEqual([expect.objectContaining({ name: "Back-end" })]);
  });

  it.each([
    { reason: "", requestedBy: "Acme" },
    { reason: "Typo", requestedBy: "   " },
  ])("refuses a correction without a reason or a requester", async (blank) => {
    const { svc, platform, repo } = setup();
    const err = await svc.reviseFromForm("mcas", posted(), blank).catch((e) => e);
    expect(err).toBeInstanceOf(FormValidationError);
    expect(err.message).toBe("Say why the description is corrected and who asked for it.");
    expect(platform.reviseVersion).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("refuses a correction of a card that is no longer the latest", async () => {
    const { svc, repo } = setup({
      reviseVersion: async () => {
        throw new PlatformStatusError("Could not correct this system: the platform answered 409.", 409);
      },
    });
    const err = await svc.reviseFromForm("mcas", posted(), amend).catch((e) => e);
    expect(err).toBeInstanceOf(FormValidationError);
    expect(err.message).toBe(
      "A newer version was saved since this page was opened. Reload it before correcting the description.",
    );
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("the card revision stored is the one the platform returned", async () => {
    const { svc, repo } = setup({ reviseVersion: async () => version(1, 5) });
    await svc.reviseFromForm("mcas", posted(), amend);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ revision: 5 }));
  });

  it.each([
    ["the page was opened on an earlier version, a newer one was saved since", "card-0"],
    ["the page was opened on an earlier revision, a newer revision was saved since", "card-1-earlier"],
    ["the page names no card", null],
  ])("refuses a correction when %s", async (_why, opened) => {
    const { svc, platform, repo } = setup();
    const err = await svc.reviseFromForm("mcas", posted(opened), amend).catch((e) => e);
    expect(err).toBeInstanceOf(FormValidationError);
    expect(err.message).toBe(STALE);
    expect(platform.reviseVersion).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });
});
