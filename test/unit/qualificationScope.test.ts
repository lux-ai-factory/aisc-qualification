import { describe, it, expect, vi } from "vitest";

// A qualification belongs to one project. Reading it by id alone would serve any
// project's system description, answers, risks and card to anyone who could
// open any project's page.
//
// The defence is the database: a repository is bound to one project's own
// database, so a query by id finds only that project's card. The seven download
// routes are under /p/{pid} and open that pid's database after the
// platform's answer (isolationRoutes.test.ts pins the stranger 404 on each).

describe("the repository reads by id inside the one project database it is bound to", () => {
  function fakeDb() {
    const calls: Record<string, unknown>[] = [];
    const record = (args: Record<string, unknown>) => {
      calls.push(args);
      return Promise.resolve(null);
    };
    return {
      calls,
      db: {
        qualification: {
          findFirst: vi.fn(record),
          findUnique: vi.fn(record),
        },
      },
    };
  }

  it("find() asks for the id, in its project's database", async () => {
    const { db, calls } = fakeDb();
    const { QualificationRepository } =
      await import("@/server/repositories/QualificationRepository");
    await new QualificationRepository(db as never).find("qual-1");

    expect(db.qualification.findUnique).not.toHaveBeenCalled();
    expect(calls[0].where).toEqual({ id: "qual-1" });
  });

  it("cardSummary() does too", async () => {
    const { db, calls } = fakeDb();
    const { QualificationRepository } =
      await import("@/server/repositories/QualificationRepository");
    await new QualificationRepository(db as never).cardSummary("qual-1");

    expect(db.qualification.findUnique).not.toHaveBeenCalled();
    expect(calls[0].where).toEqual({ id: "qual-1" });
  });
});
