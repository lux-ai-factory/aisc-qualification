/**
 * Who may read a qualification that is addressed by its own id.
 *
 * The pages live under /p/:project and the door in middleware.ts answers for
 * them. The seven download routes under /api/qualifications/:id do not: they
 * carry no project, so nothing was asking. They hand over the AI card, the
 * ontology and the PDF, which is the whole system description.
 *
 * So this reads the qualification's own project and asks the platform what
 * this caller is to it. Injected dependencies rather than imports, so the rule
 * can be tested without a database or a platform.
 */
import { prisma } from "@/lib/prisma";
import { fetchAccess, type Access } from "@/server/access/projectAccess";
import { callerToken } from "@/server/services/callerToken";

export type QualificationAccessDeps = {
  /** The project a qualification belongs to, or null if there is no such one. */
  projectOf: (id: string) => Promise<string | null>;
  /** What this caller is to that project, or null if it could not be established. */
  accessTo: (project: string) => Promise<Access | null>;
};

const live: QualificationAccessDeps = {
  projectOf: async (id) =>
    (
      await prisma.qualification.findUnique({
        where: { id },
        select: { projectId: true },
      })
    )?.projectId ?? null,
  accessTo: async (project) =>
    fetchAccess(project, await callerToken(), { platformUrl: process.env.PLATFORM_URL ?? "" }),
};

/**
 * The project this caller may read this qualification through, or null.
 *
 * Null covers all three refusals on purpose: no such qualification, not in its
 * project, and the platform could not be asked. A route turns any of them into
 * the same 404, which is what a stranger may know.
 */
export async function qualificationForCaller(
  id: string,
  deps: QualificationAccessDeps = live,
): Promise<string | null> {
  const project = await deps.projectOf(id);
  if (!project) return null;
  const access = await deps.accessTo(project);
  if (!access || !access.role) return null;
  return project;
}
