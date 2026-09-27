import { describe, it, expect, vi } from "vitest";
import { QualificationService } from "@/server/services/QualificationService";
import { FormValidationError } from "@/server/forms/QualificationFormParser";
import { customQuestion, defaultVersionLiteral, formVersion } from "../support/forms";

// Saving a card stores the form version it was filled with, and the form's
// definition always comes from the server, never from the request
// (form-assembly spec R15, section 5.2).
//
// Interface chosen here: QualificationService gains a fourth constructor
// argument `forms: { resolve(id: string | null): Promise<ResolvedFormVersion | null> }`
// (FormService by default). resolve returns null for an unknown id.
//
// Two-level forms (docs/superpowers/two-level-forms-2026-09-25/01-spec.md, 8.3, T40, T41):
// the fourth argument is a QuestionnaireResolver (questionnaireService by default); the
// posted field is questionnaireVersionId (formVersionId still read when it is absent, D20);
// forms per project (2026-09-25): the fourth argument gives the resolver of a project,
// (project) => Promise<QuestionnaireResolver>, so a card is filled with its own project's forms;
// the stored field is questionnaireVersionId; startingPoint() names fromQuestionnaireVersionId.

const version = (number: number) => ({
  pid: `v${number}`,
  number,
  project_id: "core-project-1",
  name: "Acme Vision",
  version: "1.0",
  provider: null,
  description: null,
  created_at: "2026-09-25T09:00:00Z",
  created_by: null,
});

const acmeV2 = formVersion({
  versionId: "acme-v2",
  versionNumber: 2,
  questions: [customQuestion("acme", "q1", { text: "Server-side wording", required: true })],
});

function parsed(over: Record<string, unknown> = {}) {
  return {
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
    answers: [],
    risks: [],
    ...over,
  };
}

function setup(opts: { resolved?: unknown; parsed?: Record<string, unknown>; cards?: unknown[] } = {}) {
  const platform = {
    createVersion: vi.fn(async () => version(2)),
    listVersions: vi.fn(async () => [version(1)]),
  };
  const repo = {
    create: vi.fn(async () => ({ id: "card-2" })),
    list: vi.fn(async () => opts.cards ?? []),
    update: vi.fn(async () => ({ id: "card-1" })),
  };
  const parser = { parse: vi.fn(() => parsed(opts.parsed)) };
  const forms = {
    resolve: vi.fn(async (id: string | null) =>
      "resolved" in opts ? opts.resolved : id === null ? defaultVersionLiteral() : acmeV2,
    ),
  };
  const formsFor = vi.fn(async (_project: string) => forms);
  const svc = new (QualificationService as unknown as new (...args: unknown[]) => QualificationService)(
    repo,
    parser,
    platform,
    formsFor,
  );
  return { svc, platform, repo, parser, forms, formsFor };
}

const posted = (entries: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
};

describe("saving a card with a form (R15)", () => {
  it("the questionnaire version is resolved in the card's own project", async () => {
    const { svc, formsFor } = setup();
    await svc.createFromForm("mcas", posted({ questionnaireVersionId: "acme-v2" }));
    expect(formsFor).toHaveBeenCalledWith("mcas");
  });

  it("R15 the parser gets the version loaded server side, not anything the request says about it", async () => {
    const { svc, parser, forms } = setup();
    const fd = posted({ questionnaireVersionId: "acme-v2", "q:f-acme:q1": "Answer", required: "false", blocks: "[]" });
    await svc.createFromForm("mcas", fd);
    expect(forms.resolve).toHaveBeenCalledWith("acme-v2");
    expect(parser.parse).toHaveBeenCalledTimes(1);
    const [data, form] = parser.parse.mock.calls[0] as unknown as [FormData, typeof acmeV2];
    expect(data).toBe(fd);
    expect(form).toBe(acmeV2);
  });

  it("R15 T40 the repository stores the version id as questionnaireVersionId", async () => {
    const { svc, repo } = setup();
    await svc.createFromForm("mcas", posted({ questionnaireVersionId: "acme-v2" }));
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ questionnaireVersionId: "acme-v2", systemId: "v2" }),
    );
    // the card names no project: its database is the project (isolation I1.7)
    expect((repo.create.mock.calls[0] as unknown[])[0]).not.toHaveProperty("projectId");
    expect((repo.create.mock.calls[0] as unknown[])[0]).not.toHaveProperty("formVersionId");
  });

  it("T40 the old field name formVersionId is still read when questionnaireVersionId is absent (D20)", async () => {
    const { svc, repo, forms } = setup();
    await svc.createFromForm("mcas", posted({ formVersionId: "acme-v2" }));
    expect(forms.resolve).toHaveBeenCalledWith("acme-v2");
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ questionnaireVersionId: "acme-v2" }));
  });

  it("T40 questionnaireVersionId wins over formVersionId when both are posted", async () => {
    const { svc, forms } = setup();
    await svc.createFromForm("mcas", posted({ questionnaireVersionId: "acme-v2", formVersionId: "old-v1" }));
    expect(forms.resolve).toHaveBeenCalledWith("acme-v2");
    expect(forms.resolve).not.toHaveBeenCalledWith("old-v1");
  });

  it("R15 T40 no version field means the default version, stored explicitly", async () => {
    const { svc, repo, forms, parser } = setup();
    await svc.createFromForm("mcas", posted({}));
    expect(forms.resolve).toHaveBeenCalledWith(null);
    expect((parser.parse.mock.calls[0] as unknown[])[1]).toMatchObject({ versionId: "annex-iv-default-v1" });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ questionnaireVersionId: "annex-iv-default-v1" }),
    );
  });

  it("R15 T40 an unknown version is refused before the platform is asked for anything", async () => {
    const { svc, platform, repo } = setup({ resolved: null });
    const save = svc.createFromForm("mcas", posted({ questionnaireVersionId: "gone" }));
    await expect(save).rejects.toBeInstanceOf(FormValidationError);
    await expect(
      setup({ resolved: null }).svc.createFromForm("mcas", posted({ questionnaireVersionId: "gone" })),
    ).rejects.toThrow("The questionnaire this was filled with no longer exists. Reload the page.");
    expect(platform.createVersion).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("R15 R11 a form without the description block names the version with no description", async () => {
    const { svc, platform } = setup({ parsed: { description: "" } });
    await svc.createFromForm("mcas", posted({ questionnaireVersionId: "acme-v2" }));
    expect(platform.createVersion).toHaveBeenCalledWith(
      "mcas",
      expect.objectContaining({ name: "Acme Vision", version: "1.0", provider: "Acme", description: null }),
    );
  });

  it("R15 a description is passed on as it was", async () => {
    const { svc, platform } = setup();
    await svc.createFromForm("mcas", posted({ questionnaireVersionId: "acme-v2" }));
    expect(platform.createVersion).toHaveBeenCalledWith(
      "mcas",
      expect.objectContaining({ description: "A vision system." }),
    );
  });
});

describe("where the next card starts (R8, section 5.2)", () => {
  const card = (questionnaireVersionId: string | null) => ({
    id: "card-1",
    systemId: "v1",
    projectId: "core-project-1",
    questionnaireVersionId,
    systemName: "Acme Vision",
    systemVersion: "1.0",
    company: "Acme",
    description: "d",
    targetUseCase: "u",
    targetUsers: "t",
    intendedDeployers: null,
    targetSystemTags: [],
    sectorTags: [],
    marketFormTags: [],
    localityTags: [],
    answers: [],
    risks: [],
    components: [],
  });

  it("R8 T40 names the previous card's questionnaire version", async () => {
    const { svc } = setup({ cards: [card("acme-v2")] });
    const start = await svc.startingPoint("mcas");
    expect(start.fromQuestionnaireVersionId).toBe("acme-v2");
  });

  it("R7 R8 T40 a legacy previous card resolves to the default version", async () => {
    const { svc } = setup({ cards: [card(null)] });
    expect((await svc.startingPoint("mcas")).fromQuestionnaireVersionId).toBe("annex-iv-default-v1");
  });

  it("R8 T40 a first card has no previous questionnaire", async () => {
    const { svc } = setup({ cards: [] });
    expect((await svc.startingPoint("mcas")).fromQuestionnaireVersionId).toBeNull();
  });
});

describe("moving a card to another questionnaire version (T41)", () => {
  const acmeV3 = formVersion({
    versionId: "acme-v3",
    versionNumber: 3,
    questions: [customQuestion("acme", "q1", { text: "Reworded server-side", setVersionId: "acme-v2" })],
  });

  it("T41 saving with a newer version V makes the next card, filled with V, and never updates the previous card", async () => {
    const { svc, repo, forms, platform } = setup({ resolved: acmeV3 });
    await svc.createFromForm("mcas", posted({ questionnaireVersionId: "acme-v3", "q:f-acme:q1": "Kept answer" }));
    expect(forms.resolve).toHaveBeenCalledWith("acme-v3");
    expect(platform.createVersion).toHaveBeenCalledTimes(1);
    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ questionnaireVersionId: "acme-v3", systemId: "v2" }),
    );
    expect(repo.update).not.toHaveBeenCalled();
  });
});
