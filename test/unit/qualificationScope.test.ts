import { describe, it, expect, vi } from "vitest";

// A qualification belongs to one project. Reading it by id alone served any
// project's system description, answers, risks and card to anyone who could
// open any project's page, and the seven download routes under
// /api/qualifications/:id were not even behind the project door.
//
// Two defences, because there are two kinds of caller. A page inside a project
// puts the project in the query. A download route has no project in its path,
// so it reads the qualification's own project and asks the platform whether
// this caller is in it.

describe("the repository scopes every read to a project", () => {
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

  it("find() asks for the id inside the project", async () => {
    const { db, calls } = fakeDb();
    const { QualificationRepository } = await import(
      "@/server/repositories/QualificationRepository"
    );
    await new QualificationRepository(db as never).find("proj-1", "qual-1");

    expect(db.qualification.findUnique).not.toHaveBeenCalled();
    expect(calls[0].where).toEqual({ id: "qual-1", projectId: "proj-1" });
  });

  it("cardSummary() does too", async () => {
    const { db, calls } = fakeDb();
    const { QualificationRepository } = await import(
      "@/server/repositories/QualificationRepository"
    );
    await new QualificationRepository(db as never).cardSummary("proj-1", "qual-1");

    expect(db.qualification.findUnique).not.toHaveBeenCalled();
    expect(calls[0].where).toEqual({ id: "qual-1", projectId: "proj-1" });
  });
});

describe("a download route asks who the caller is to the qualification's project", () => {
  it("hands it over to somebody in that project", async () => {
    const { qualificationForCaller } = await import("@/server/access/qualificationAccess");
    const found = await qualificationForCaller("qual-1", {
      projectOf: async () => "proj-1",
      accessTo: async (project) => ({ role: project === "proj-1" ? "viewer" : null, admin: false, may_write: false }),
    });
    expect(found).toBe("proj-1");
  });

  it("refuses somebody who is in no project of it", async () => {
    const { qualificationForCaller } = await import("@/server/access/qualificationAccess");
    const found = await qualificationForCaller("qual-1", {
      projectOf: async () => "proj-1",
      accessTo: async () => ({ role: null, admin: false, may_write: false }),
    });
    expect(found).toBeNull();
  });

  it("refuses when the qualification does not exist", async () => {
    const { qualificationForCaller } = await import("@/server/access/qualificationAccess");
    const found = await qualificationForCaller("nope", {
      projectOf: async () => null,
      accessTo: async () => ({ role: "owner", admin: false, may_write: true }),
    });
    expect(found).toBeNull();
  });

  it("refuses when the platform cannot be reached", async () => {
    // Failing open here would leave the download routes exactly as they were.
    const { qualificationForCaller } = await import("@/server/access/qualificationAccess");
    const found = await qualificationForCaller("qual-1", {
      projectOf: async () => "proj-1",
      accessTo: async () => null,
    });
    expect(found).toBeNull();
  });
});
