// The ledger, against a real project database made the platform's way (its template has
// ledger.emit): each action writes its event with ledger.emit in the change's own
// transaction, a rolled-back change leaves no event, and what a change overwrites is kept in
// card_history. The doors, the platform and the engine are stubbed; the database is not.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";

const TEMPLATE = process.env.QUALIFICATION_TEST_PROJECT_DATABASE_URL ?? "";
const ADMIN_TEMPLATE = process.env.QUALIFICATION_TEST_PROJECT_ADMIN_URL ?? "";
const [, B] = (process.env.QUALIFICATION_TEST_PROJECTS ?? "").split(",");
const enabled = TEMPLATE !== "" && ADMIN_TEMPLATE !== "" && !!B;
if (enabled && [TEMPLATE, ADMIN_TEMPLATE].some((u) => /:5432\//.test(u))) {
  throw new Error(
    "refusing to run the DB tests against port 5432 (the live stack)",
  );
}
const APP = resolve(__dirname, "..", "..");
const dbName = (pid: string) =>
  `project_${pid.toLowerCase().replace(/-/g, "")}`;
const at = (template: string, database: string) =>
  template.replace("{database}", database);
const REQUEST = "a1a1a1a1-0000-4000-8000-000000000001";
const V1 = "c5c5c5c5-0000-4000-8000-000000000001";
const V2 = "c5c5c5c5-0000-4000-8000-000000000002";

const state = vi.hoisted(() => ({
  db: null as unknown,
  su: null as unknown,
  request: "" as string,
  fill: [] as unknown[],
  failAfter: "" as string,
}));
// the real emitter; a test can make the next write fail right after a given event (failAfter)
vi.mock("@/vendor/aisc-ledger/emit", async (orig) => {
  const real = await orig<typeof import("@/vendor/aisc-ledger/emit")>();
  return {
    ...real,
    emitEvent: async (tx: never, event: { action: string }) => {
      const id = await real.emitEvent(tx, event as never);
      if (state.failAfter && state.failAfter === event.action) {
        state.failAfter = "";
        throw new Error("a failure right after the event (test)");
      }
      return id;
    },
  };
});
vi.mock("@/lib/projectDb", async (orig) => ({
  ...(await orig<typeof import("@/lib/projectDb")>()),
  projectDbForAction: async () => ({ db: state.db }),
  projectDbForRoute: async () => state.db,
  projectDbPastDoor: async () => state.db,
  projectDbForService: async () => state.db,
}));
vi.mock("@/server/services/cardLatest", async (orig) => ({
  ...(await orig<typeof import("@/server/services/cardLatest")>()),
  assertLatestCard: async () => undefined,
  isLatestCard: async () => true,
}));
vi.mock("@/server/services/FillerClient", () => ({
  // No run in flight: the refinement goes ahead
  fillInFlight: async () => false,
  // what the outbox holds when the agent is asked: the run must be open by then
  requestFill: async (...args: unknown[]) => {
    const rows = await (state.su as PrismaClient).$queryRawUnsafe<
      { n: number }[]
    >(
      `SELECT count(*)::int AS n FROM ledger.outbox WHERE action = 'card.ai_refinement_requested' AND item_id = $1`,
      args[1],
    );
    state.fill.push([...args, { openBefore: rows[0].n }]);
    return true;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/server/services/OntologyClient", () => ({
  OntologyClient: {
    fromEnv: () => ({
      build: async () => ({ view: { nodes: [] }, problems: [] }),
      vocabularies: async () => ({}),
    }),
  },
}));
vi.mock("@/server/services/KnowledgeGraphStore", () => ({
  KnowledgeGraphStore: class {
    async save() {}
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-aisc-request-id": state.request }),
}));
// local work: no gateway token to verify, so the presented request id is cited as it is
// (test/unit/ledger/requestIdThroughGateway.test.ts checks who may set it with auth on)
process.env.AUTH_ENABLED = "false";

let su: PrismaClient;
let rw: PrismaClient;

type Row = {
  action: string;
  item_id: string | null;
  db_role: string;
  request_id: string | null;
  run_id: string | null;
  details: Record<string, unknown>;
  content: unknown;
  before: unknown;
  after: unknown;
};
const outbox = (card: string) =>
  su.$queryRawUnsafe<Row[]>(
    `SELECT action, item_id, db_role, request_id::text, run_id::text, details, content, before, after
       FROM ledger.outbox WHERE item_id = $1 ORDER BY occurred_at, event_id`,
    card,
  );
const history = (card: string) =>
  su.$queryRawUnsafe<
    {
      kind: string;
      subject: string | null;
      before: unknown;
      after: unknown;
      changed_by: string;
    }[]
  >(
    `SELECT kind, subject, before, after, changed_by FROM qualification.card_history WHERE qualification_id = $1 ORDER BY id`,
    card,
  );

const TAG = Date.now().toString(36); // a kept database is run again
/** A card on a new card version, which is then the latest (one card per version), or on `systemId`. */
async function newCard(id: string, systemId?: string) {
  if (!systemId) {
    const [{ n }] = await su.$queryRawUnsafe<{ n: number }[]>(
      `SELECT coalesce(max(number), 0)::int + 1 AS n FROM project.system`,
    );
    systemId = randomUUID();
    await su.$executeRawUnsafe(
      `INSERT INTO project.system (pid, number, name) VALUES ('${systemId}', ${n}, 'MCAS')`,
    );
  }
  await su.$executeRawUnsafe(`
    INSERT INTO qualification.qualification (id, system_id, "systemName", "systemVersion", company,
      description, "targetUseCase", "targetUsers", updated_at)
    VALUES ('${id}', '${systemId}', 'MCAS', '2', 'LIST', 'd', 'u', 't', now())`);
}

beforeAll(async () => {
  if (!enabled) return;
  const run = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: APP,
    env: { ...process.env, DATABASE_URL: at(TEMPLATE, dbName(B)) },
    encoding: "utf8",
    timeout: 240_000,
  });
  if (run.status !== 0)
    throw new Error(
      `migrate deploy failed: ${(run.stdout + run.stderr).slice(-600)}`,
    );
  su = new PrismaClient({ datasourceUrl: at(ADMIN_TEMPLATE, dbName(B)) });
  rw = new PrismaClient({ datasourceUrl: at(TEMPLATE, dbName(B)) });
  state.db = rw;
  state.su = su;
  for (const [pid, n] of [
    [V1, 1],
    [V2, 2],
  ] as const) {
    await su.$executeRawUnsafe(
      `INSERT INTO project.system (pid, number, name) VALUES ('${pid}', ${n}, 'MCAS') ON CONFLICT DO NOTHING`,
    );
  }
}, 300_000);

afterAll(async () => {
  await su?.$disconnect();
  await rw?.$disconnect();
});

beforeEach(() => {
  vi.stubEnv("LEDGER_MODE", "record");
  state.request = REQUEST;
  state.fill = [];
});

describe.skipIf(!enabled)(
  "every card action writes its event in its own transaction",
  () => {
    it("a change refused on an older version leaves neither the change nor its event", async () => {
      const { patchOntologyNode } =
        await import("@/app/p/[project]/qualify/[id]/ontology-actions");
      await newCard(`lg-old-card-${TAG}`);
      await newCard(`lg-newer-card-${TAG}`); // now the first is not the latest
      const r = await patchOntologyNode(B, `lg-old-card-${TAG}`, "n1", { label: "x" });
      expect(r.ok).toBe(false);
      expect(await outbox(`lg-old-card-${TAG}`)).toEqual([]);
      expect(await history(`lg-old-card-${TAG}`)).toEqual([]);
    });

    it("nothing is written while the ledger is off", async () => {
      const { patchOntologyNode } =
        await import("@/app/p/[project]/qualify/[id]/ontology-actions");
      vi.stubEnv("LEDGER_MODE", "off");
      await newCard(`lg-card-off-${TAG}`);
      expect(
        (await patchOntologyNode(B, `lg-card-off-${TAG}`, "n1", { label: "x" })).ok,
      ).toBe(true);
      expect(await outbox(`lg-card-off-${TAG}`)).toEqual([]);
    });

    it("the refinement opens its run before the agent is asked, and passes the run on", async () => {
      const { rerunFill } =
        await import("@/app/p/[project]/qualify/[id]/fill-actions");
      await newCard(`lg-card-run-${TAG}`);
      expect(await rerunFill(B, `lg-card-run-${TAG}`)).toEqual({ ok: true });
      const [row] = await outbox(`lg-card-run-${TAG}`);
      expect(row.action).toBe("card.ai_refinement_requested");
      expect(row.run_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(state.fill).toEqual([
        [
          B,
          `lg-card-run-${TAG}`,
          { runId: row.run_id, requestId: REQUEST },
          { openBefore: 1 },
        ],
      ]);
    });
  },
);

describe.skipIf(!enabled)(
  "a person's or the agent's draft keeps the draft it replaces",
  () => {
    async function put(
      card: string,
      body: unknown,
      headers: Record<string, string> = {},
    ) {
      const { PUT } =
        await import("@/app/p/[project]/api/qualifications/[id]/extracted/route");
      return PUT(
        new Request("http://x/", {
          method: "PUT",
          body: JSON.stringify(body),
          headers,
        }),
        { params: Promise.resolve({ project: B, id: card }) },
      );
    }

    it("a person's PUT is card.extracted_replaced_by_user, the agent's is card.augmented_by_ai on its run", async () => {
      await newCard(`lg-card-draft-${TAG}`);
      expect(
        (await put(`lg-card-draft-${TAG}`, { techniques: [] })).status,
      ).toBe(200);
      const agent = "test-agent-to-web"; // a test value, never a real token
      vi.stubEnv("QUALIFICATION_AGENTS_TO_WEB_TOKEN", agent);
      const run = "b5b5b5b5-0000-4000-8000-000000000001";
      const res = await put(
        `lg-card-draft-${TAG}`,
        { techniques: [], flags: { n1: ["ungrounded"] } },
        {
          "X-AISC-Service-Token": agent,
          "X-AISC-Run-Id": run,
          "X-AISC-Model": "openai/gpt-4o-mini",
        },
      );
      expect(res.status).toBe(200);
      const rows = await outbox(`lg-card-draft-${TAG}`);
      expect(rows.map((r) => [r.action, r.run_id])).toEqual([
        ["card.extracted_replaced_by_user", null],
        ["card.augmented_by_ai", run],
      ]);
      expect(rows[1].details).toEqual({ flagged: 1 });
      expect(
        (await history(`lg-card-draft-${TAG}`)).map((h) => [
          h.kind,
          h.changed_by,
        ]),
      ).toEqual([
        ["extracted_replaced", "person"],
        ["extracted_replaced", "agent"],
      ]);
      expect((await history(`lg-card-draft-${TAG}`))[1].before).toEqual({
        techniques: [],
      }); // the person's draft, kept
    });

    it("with AUTH_ENABLED on, the agent's card.augmented_by_ai cites the request id it sends", async () => {
      // The request id is kept only when a gateway token verifies, and a service call carries
      // none. The agent is trusted by its token instead, so its own X-AISC-Request-Id is cited.
      const card = `lg-card-agentreq-${TAG}`;
      await newCard(card);
      vi.stubEnv("AUTH_ENABLED", "true");
      vi.stubEnv("KEYCLOAK_ISSUER", "");
      vi.stubEnv("KEYCLOAK_JWKS_URL", "");
      try {
        const agent = "test-agent-to-web"; // a test value, never a real token
        vi.stubEnv("QUALIFICATION_AGENTS_TO_WEB_TOKEN", agent);
        const run = "b5b5b5b5-0000-4000-8000-000000000002";
        const refinement = "c6c6c6c6-0000-4000-8000-000000000003";
        const send = (requestId: string) =>
          put(
            card,
            { techniques: [] },
            {
              "X-AISC-Service-Token": agent,
              "X-AISC-Run-Id": run,
              "X-AISC-Request-Id": requestId,
            },
          );
        expect((await send(refinement)).status).toBe(200);
        // an id that is not a UUID is not cited
        expect((await send("not-a-uuid")).status).toBe(200);
        const rows = await outbox(card);
        expect(rows.map((r) => [r.action, r.run_id, r.request_id])).toEqual([
          ["card.augmented_by_ai", run, refinement],
          ["card.augmented_by_ai", run, null],
        ]);
      } finally {
        vi.stubEnv("AUTH_ENABLED", "false");
      }
    });
  },
);

describe.skipIf(!enabled)("card_history is append-only", () => {
  it("refuses an update and a delete", async () => {
    const card = `lg-card-ao-${TAG}`;
    await newCard(card);
    await su.$executeRawUnsafe(
      `INSERT INTO qualification.card_history (qualification_id, kind) VALUES ('${card}', 'node_corrected')`,
    );
    await expect(
      su.$executeRawUnsafe(
        `UPDATE qualification.card_history SET kind = 'corrections_discarded' WHERE qualification_id = '${card}'`,
      ),
    ).rejects.toThrow(/immutable/);
    await expect(
      su.$executeRawUnsafe(
        `DELETE FROM qualification.card_history WHERE qualification_id = '${card}'`,
      ),
    ).rejects.toThrow(/immutable/);
  });
});

describe.skipIf(!enabled)(
  "forms: a save writes its events in its transaction",
  () => {
    it("a new set and its questionnaire, then a next version", async () => {
      const { saveQuestionSet } =
        await import("@/app/p/[project]/question-sets/actions");
      vi.doMock("next/navigation", () => ({
        redirect: (to: string) => {
          throw Object.assign(new Error("NEXT_REDIRECT"), { to });
        },
      }));
      const draft = {
        name: `Ledger set ${Date.now()}`,
        questions: [
          {
            text: "What is it for?",
            citation: "",
            required: true,
            annexPoint: null,
          },
        ],
      };
      await saveQuestionSet(B, JSON.stringify(draft), undefined, {
        alsoQuestionnaire: true,
      }).catch(() => undefined);
      const rows = await su.$queryRawUnsafe<
        { action: string; details: Record<string, unknown> }[]
      >(
        `SELECT action, details FROM ledger.outbox WHERE action LIKE 'question%' AND content::text LIKE $1 ORDER BY occurred_at`,
        `%${draft.name}%`,
      );
      expect(rows.map((r) => r.action)).toEqual([
        "question_set.created",
        "questionnaire.created",
      ]);
      expect(rows[0].details).toEqual({ version: 1 });
    });
  },
);

describe.skipIf(!enabled)(
  "a correction, and discarding them all, keep what they replace",
  () => {
    it("node_corrected keeps the node's patch before and after; corrections_discarded keeps them all", async () => {
      const { patchOntologyNode, resetOntology } =
        await import("@/app/p/[project]/qualify/[id]/ontology-actions");
      const card = `lg-card-fix-${TAG}`;
      await newCard(card);
      expect(
        (await patchOntologyNode(B, card, "n1", { label: "First" })).ok,
      ).toBe(true);
      expect(
        (await patchOntologyNode(B, card, "n1", { label: "Second" })).ok,
      ).toBe(true);
      expect((await resetOntology(B, card)).ok).toBe(true);
      const rows = await outbox(card);
      expect(rows.map((r) => r.action)).toEqual([
        "card.node_corrected",
        "card.node_corrected",
        "card.corrections_discarded",
      ]);
      expect(rows[1].content).toEqual({
        change: { label: "Second" },
        before: { label: "First" },
        after: { label: "Second" },
      });
      expect((rows[2].content as { before: unknown }).before).toEqual({
        n1: { label: "Second" },
      });
      const kept = await history(card);
      expect(kept.map((h) => [h.kind, h.subject])).toEqual([
        ["node_corrected", "n1"],
        ["node_corrected", "n1"],
        ["corrections_discarded", null],
      ]);
      expect(kept[2].before).toEqual({ n1: { label: "Second" } }); // nothing is lost by a reset
    });

    it("a reset with no corrections changes nothing and records nothing", async () => {
      const { resetOntology } =
        await import("@/app/p/[project]/qualify/[id]/ontology-actions");
      const card = `lg-card-nofix-${TAG}`;
      await newCard(card);
      expect((await resetOntology(B, card)).ok).toBe(true);
      expect(await outbox(card)).toEqual([]);
    });
  },
);

describe.skipIf(!enabled)("a new card and its event commit together", () => {
  it("qualification.created is written in the card's transaction, and not at all when the card is refused", async () => {
    const { QualificationService } =
      await import("@/server/services/QualificationService");
    const { QualificationRepository } =
      await import("@/server/repositories/QualificationRepository");
    const repo = new QualificationRepository(rw);
    const fields = {
      systemName: "MCAS",
      systemVersion: "9",
      company: "LIST",
      description: "d",
      targetUseCase: "u",
      targetUsers: "t",
      intendedDeployers: null,
      systemType: null,
      purpose: null,
      providerTerm: null,
      deployerTerm: null,
      targetSystemTags: [],
      sectorTags: [],
      marketFormTags: [],
      localityTags: [],
      answers: [],
      risks: [],
    };
    const make = (pid: string) =>
      new QualificationService(
        repo,
        {
          parse: () => ({
            ...fields,
            formVersionId: "v",
            systemComponents: [],
          }),
        } as never,
        {
          createVersion: async () => ({ pid, project_id: B }),
          syncTargets: async () => undefined,
          listVersions: async () => [],
        } as never,
        async () => ({ resolve: async () => ({ versionId: null }) }) as never,
      );
    const { emitEvent } = await import("@/vendor/aisc-ledger/emit");
    const record = async (tx: Prisma.TransactionClient, c: { id: string }) =>
      emitEvent(tx, {
        action: "qualification.created",
        itemType: "qualification",
        itemId: c.id,
        content: {},
      });
    const [{ n }] = await su.$queryRawUnsafe<{ n: number }[]>(
      `SELECT coalesce(max(number), 0)::int + 1 AS n FROM project.system`,
    );
    const pid = randomUUID();
    await su.$executeRawUnsafe(
      `INSERT INTO project.system (pid, number, name) VALUES ('${pid}', ${n}, 'MCAS')`,
    );
    const { id } = await make(pid).createFromForm(B, new FormData(), record);
    expect((await outbox(id)).map((r) => r.action)).toEqual([
      "qualification.created",
    ]);
    // an event written, then the transaction fails after it: neither the card nor its event stays
    const pid2 = randomUUID();
    await su.$executeRawUnsafe(
      `INSERT INTO project.system (pid, number, name) VALUES ('${pid2}', ${n + 1}, 'MCAS')`,
    );
    let written = "";
    const thenFail = async (
      tx: Prisma.TransactionClient,
      c: { id: string },
    ) => {
      written = c.id;
      await record(tx, c);
      throw new Error("a failure after the event (test)");
    };
    await expect(
      make(pid2).createFromForm(B, new FormData(), thenFail),
    ).rejects.toThrow(/after the event/);
    expect(written).not.toBe("");
    expect(await outbox(written)).toEqual([]);
    const [{ cards }] = await su.$queryRawUnsafe<{ cards: number }[]>(
      `SELECT count(*)::int AS cards FROM qualification.qualification WHERE id = $1`,
      written,
    );
    expect(cards).toBe(0);
  });
});

describe.skipIf(!enabled)(
  "each change and its event are one transaction (review test gap)",
  () => {
    async function put(card: string) {
      const { PUT } =
        await import("@/app/p/[project]/api/qualifications/[id]/extracted/route");
      return PUT(
        new Request("http://x/", {
          method: "PUT",
          body: JSON.stringify({ techniques: [] }),
        }),
        { params: Promise.resolve({ project: B, id: card }) },
      );
    }

    it("a failure right after the draft's event leaves neither the draft, its history, nor the event", async () => {
      const card = `lg-card-tx-${TAG}`;
      await newCard(card);
      state.failAfter = "card.extracted_replaced_by_user";
      await expect(put(card)).rejects.toThrow(/right after the event/);
      expect(await outbox(card)).toEqual([]);
      expect(await history(card)).toEqual([]);
      const [{ draft }] = await su.$queryRawUnsafe<{ draft: unknown }[]>(
        `SELECT "ontologyExtracted" AS draft FROM qualification.qualification WHERE id = $1`,
        card,
      );
      expect(draft).toBeNull();
    });

    it("and the same for a correction", async () => {
      const { patchOntologyNode } =
        await import("@/app/p/[project]/qualify/[id]/ontology-actions");
      const card = `lg-card-tx2-${TAG}`;
      await newCard(card);
      state.failAfter = "card.node_corrected";
      expect((await patchOntologyNode(B, card, "n1", { label: "x" })).ok).toBe(
        false,
      );
      expect(await outbox(card)).toEqual([]);
      expect(await history(card)).toEqual([]);
      const [{ links }] = await su.$queryRawUnsafe<{ links: number }[]>(
        `SELECT count(*)::int AS links FROM qualification.card_component WHERE qualification_id = $1`,
        card,
      );
      expect(links).toBe(0);
    });
  },
);

describe.skipIf(!enabled)(
  "no event of a forms save carries its author",
  () => {
    it("the content of question_set.created has no createdBy", async () => {
      const rows = await su.$queryRawUnsafe<{ content: unknown }[]>(
        `SELECT content FROM ledger.outbox WHERE action IN ('question_set.created', 'questionnaire.created')`,
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows)
        expect(JSON.stringify(r.content)).not.toMatch(/createdBy|created_by/);
    });
  },
);
