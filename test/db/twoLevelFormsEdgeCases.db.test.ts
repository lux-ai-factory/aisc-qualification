import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { loadSrc } from "../support/forms";

// The import and retire-race cases of test/unit/twoLevelFormsEdgeCases.test.ts, against a real
// Postgres with the migration applied (the CHECK and the triggers are what the unit fakes only
// imitate):
//
//   - a self-contained import with a groupLabel the CHECK refuses is answered with a user
//     message; nothing is written and nothing is thrown.
//   - a save or a second retire that meets a retire committed meanwhile gets the usual
//     user message; the real Prisma error carries the trigger's text.
//
// The race is made by reading through a repository whose find answers retired_at NULL (the
// racing writer's stale read); the write then meets the real row.
//
// Runs only against a throwaway database (test/db/throwaway-db.sh); ports 5432 and 5433 refused.

const APP_URL = process.env.QUALIFICATION_TEST_DATABASE_URL ?? "";
const ADMIN_URL = process.env.QUALIFICATION_TEST_ADMIN_URL ?? "";
const enabled = APP_URL !== "" && ADMIN_URL !== "";
if (enabled && [APP_URL, ADMIN_URL].some((u) => /:543[23]\//.test(u))) {
  throw new Error(
    "refusing to run the DB tests against port 5432 or 5433 (the running stack)",
  );
}

let app: PrismaClient;
beforeAll(() => {
  if (!enabled) return;
  app = new PrismaClient({ datasourceUrl: APP_URL });
});
afterAll(async () => {
  await app?.$disconnect();
});

async function services(): Promise<any> {
  const { QuestionnaireRepository } = await loadSrc(
    "server/repositories/QuestionnaireRepository.ts",
  );
  const { QuestionnaireService } = await loadSrc(
    "server/services/QuestionnaireService.ts",
  );
  const { QuestionSetService } = await loadSrc(
    "server/services/QuestionSetService.ts",
  );
  const repo = new QuestionnaireRepository(app);
  /** The same repository, but its reads of `id` see retired_at NULL. */
  const stale = (id: string) => {
    const r = Object.create(repo);
    const fresh = (row: { id: string } | null) =>
      row && row.id === id ? { ...row, retiredAt: null } : row;
    r.findSet = async (x: string) => fresh(await repo.findSet(x));
    r.findQuestionnaire = async (x: string) =>
      fresh(await repo.findQuestionnaire(x));
    r.listQuestionnaires = async () =>
      (await repo.listQuestionnaires()).map(fresh);
    return r;
  };
  return {
    repo,
    sets: (r = repo) => new QuestionSetService(r),
    questionnaires: (r = repo) => new QuestionnaireService(r),
    stale,
  };
}

const count = async (table: string) =>
  Number(
    (
      await app.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*) AS n FROM qualification.${table}`,
      )
    )[0].n,
  );
const counts = async () =>
  Promise.all(
    [
      "question_set",
      "question_set_version",
      "question",
      "question_set_version_item",
      "questionnaire",
      "questionnaire_version",
      "questionnaire_version_item",
    ].map(count),
  );

describe.skipIf(!enabled)(
  "the self-contained import refuses a groupLabel the CHECK would refuse",
  () => {
    for (const [label, value] of [
      ["empty", ""],
      ["blank", "   "],
      ["121 characters", "x".repeat(121)],
      ["a number", 7],
    ] as const) {
      it(`groupLabel ${label}: the import's refusal message, no row, nothing thrown`, async () => {
        const { questionnaires } = await services();
        const tag = randomUUID().slice(0, 8);
        const before = await counts();
        const r = await questionnaires().importSelfContained(
          {
            name: `H4 ${tag}`,
            description: "",
            blocks: ["risks"],
            items: [
              {
                text: "First?",
                citation: "",
                required: true,
                annexPoint: null,
                groupLabel: "Fine",
              },
              {
                text: "Second?",
                citation: "",
                required: true,
                annexPoint: null,
                groupLabel: value,
              },
            ],
          },
          {
            setName: `H4 set ${tag}`,
            questionnaireName: `H4 q ${tag}`,
            createdBy: "erin",
          },
        );
        expect(r).toEqual({
          ok: false,
          error:
            "item 2: groupLabel must be text of at most 120 characters or null",
        });
        expect(await counts()).toEqual(before);
      });
    }
  },
);

describe.skipIf(!enabled)(
  "a retire racing a save or a retire, on the real triggers",
  () => {
    async function freshSetAndQuestionnaire(): Promise<any> {
      const s = await services();
      const tag = randomUUID().slice(0, 8);
      const set = await s.sets().saveDraft(
        {
          name: `Retire race set ${tag}`,
          questions: [
            { text: "A?", citation: "", required: true, annexPoint: null },
          ],
        },
        { createdBy: "alice", alsoQuestionnaire: true },
      );
      expect(set).toMatchObject({ ok: true });
      const v = await s.repo.findSetVersion(set.versionId);
      return {
        setId: set.setId,
        questionnaireId: set.questionnaireId,
        questionId: v.items[0].questionId,
        s,
      };
    }

    it("a set save meeting a committed retire: That question set cannot be changed.", async () => {
      const { setId, questionId, s } = await freshSetAndQuestionnaire();
      const sets = s.sets;
      expect(await sets().retire(setId)).toEqual({ ok: true });
      const before = await counts();
      const r = await sets(s.stale(setId)).saveDraft(
        {
          name: "x",
          questions: [
            {
              questionId,
              text: "A2?",
              citation: "",
              required: true,
              annexPoint: null,
            },
          ],
        },
        { setId, createdBy: "bob" },
      );
      expect(r).toEqual({
        ok: false,
        error: "That question set cannot be changed.",
      });
      expect(await counts()).toEqual(before);
    });

    it("a second set retire racing the first: That question set cannot be archived.", async () => {
      const { setId, s } = await freshSetAndQuestionnaire();
      const sets = s.sets;
      expect(await sets().retire(setId)).toEqual({ ok: true });
      expect(await sets(s.stale(setId)).retire(setId)).toEqual({
        ok: false,
        error: "That question set cannot be archived.",
      });
    });

    it("a questionnaire save meeting a committed retire: That questionnaire cannot be changed.", async () => {
      const { questionnaireId, s } = await freshSetAndQuestionnaire();
      const qs = s.questionnaires;
      expect(await qs().retire(questionnaireId)).toEqual({ ok: true });
      const before = await counts();
      const r = await qs(s.stale(questionnaireId)).saveDraft(
        {
          name: "x",
          description: "",
          blocks: ["risks"],
          items: [{ setVersionId: "annex-iv-v1", questionId: "annex-iv-2a" }],
        },
        { questionnaireId, listed: true, createdBy: "bob" },
      );
      expect(r).toEqual({
        ok: false,
        error: "That questionnaire cannot be changed.",
      });
      expect(await counts()).toEqual(before);
    });

    it("a second questionnaire retire racing the first: That questionnaire cannot be archived.", async () => {
      const { questionnaireId, s } = await freshSetAndQuestionnaire();
      const qs = s.questionnaires;
      expect(await qs().retire(questionnaireId)).toEqual({ ok: true });
      expect(
        await qs(s.stale(questionnaireId)).retire(questionnaireId),
      ).toEqual({
        ok: false,
        error: "That questionnaire cannot be archived.",
      });
    });
  },
);

// Two editors opened on the same version both save. The
// first makes the next version; the second, numbered after the same base, meets the real
// unique (id, number) index and gets the RACED message. The latest keeps the first save.
const requiredQuestion = (text: string, questionId?: string) => ({
  ...(questionId ? { questionId } : {}),
  text,
  citation: "",
  required: true,
  annexPoint: null,
});

describe.skipIf(!enabled)("a stale editor's save meets the unique index", () => {
  it("question set: two saves from base 2, the second is RACED and v3 keeps the first", async () => {
    const sets = (await services()).sets();
    const name = `Stale save set ${randomUUID().slice(0, 8)}`;
    const v1 = await sets.saveDraft(
      { name, description: "", questions: [requiredQuestion("A")] },
      { createdBy: "alice" },
    );
    expect(v1).toMatchObject({ ok: true, number: 1 });
    const qid = (await sets.latest(v1.setId)).questions[0].questionId;
    const v2 = await sets.saveDraft(
      { name, description: "", questions: [requiredQuestion("B", qid)] },
      { setId: v1.setId, baseNumber: 1, createdBy: "alice" },
    );
    expect(v2).toMatchObject({ ok: true, number: 2, created: true });

    const a = await sets.saveDraft(
      { name, description: "", questions: [requiredQuestion("Reworded by A", qid)] },
      { setId: v1.setId, baseNumber: 2, createdBy: "alice" },
    );
    expect(a).toMatchObject({ ok: true, number: 3, created: true });
    const b = await sets.saveDraft(
      { name, description: "", questions: [requiredQuestion("Stale from B", qid)] },
      { setId: v1.setId, baseNumber: 2, createdBy: "bob" },
    );
    expect(b).toEqual({
      ok: false,
      error:
        "This question set was saved by someone else meanwhile. Reload it and save again.",
    });
    const latest = await sets.latest(v1.setId);
    expect(latest.versionNumber).toBe(3);
    expect(latest.questions.map((x: { text: string }) => x.text)).toEqual([
      "Reworded by A",
    ]);
  });

  it("questionnaire: two saves from base 1, the second is RACED and v2 keeps the first", async () => {
    const svc = await services();
    const sets = svc.sets();
    const questionnaires = svc.questionnaires();
    const tag = randomUUID().slice(0, 8);
    const set = await sets.saveDraft(
      { name: `Stale save questionnaire set ${tag}`, description: "", questions: [requiredQuestion("A"), requiredQuestion("B")] },
      { createdBy: "alice" },
    );
    const sv = await sets.latest(set.setId);
    const [qa, qb] = sv.questions.map(
      (x: { questionId: string }) => x.questionId,
    );
    const pick = (questionId: string) => ({
      setVersionId: sv.versionId,
      questionId,
    });
    const name = `Stale save questionnaire ${tag}`;
    const v1 = await questionnaires.saveDraft(
      { name, description: "", blocks: [], items: [pick(qa)] },
      { listed: true, createdBy: "alice" },
    );
    expect(v1).toMatchObject({ ok: true, number: 1 });

    const a = await questionnaires.saveDraft(
      { name, description: "", blocks: [], items: [pick(qa), pick(qb)] },
      { questionnaireId: v1.questionnaireId, baseNumber: 1, listed: true, createdBy: "alice" },
    );
    expect(a).toMatchObject({ ok: true, number: 2, created: true });
    const b = await questionnaires.saveDraft(
      { name, description: "", blocks: ["risks"], items: [pick(qb)] },
      { questionnaireId: v1.questionnaireId, baseNumber: 1, listed: true, createdBy: "bob" },
    );
    expect(b).toEqual({
      ok: false,
      error:
        "This questionnaire was saved by someone else meanwhile. Reload it and save again.",
    });
    const latest = await questionnaires.latestVersion(v1.questionnaireId);
    expect(latest.versionNumber).toBe(2);
    expect(latest.questions.map((x: { questionId: string }) => x.questionId)).toEqual([qa, qb]);
  });
});
