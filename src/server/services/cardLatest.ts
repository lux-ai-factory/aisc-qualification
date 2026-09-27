/**
 * Only the latest card version changes.
 *
 * Every save makes the next version; an older version's card is kept as it was.
 * The database refuses such a write too (qualification's only-latest triggers);
 * this check comes first so a refused action writes nothing and says why.
 */
import { platformClient } from "@/server/services/PlatformClient";

export const NOT_LATEST =
  "403: this AI card is of an older version and is kept as it was; only the latest version changes.";

export class NotLatestError extends Error {
  constructor() {
    super(NOT_LATEST);
    this.name = "NotLatestError";
  }
}

/** Whether `systemId` is the project's latest card version. */
export async function isLatestCard(projectId: string, systemId: string): Promise<boolean> {
  const latest = await platformClient.latestVersion(projectId);
  return latest?.pid === systemId;
}

/** Throws NotLatestError unless `systemId` is the project's latest card version. */
export async function assertLatestCard(projectId: string, systemId: string): Promise<void> {
  if (!(await isLatestCard(projectId, systemId))) throw new NotLatestError();
}

/**
 * The same question, asked of the database rather than the platform: the rule
 * the only-latest triggers enforce (qualification.card_is_latest). For a caller
 * with no user behind it, the card agent, which the platform's
 * /system-versions/latest would not answer.
 */
export async function isLatestCardInDb(systemId: string): Promise<boolean> {
  const { prisma } = await import("@/lib/prisma");
  const rows = await prisma.$queryRaw<{ latest: boolean }[]>`
    SELECT qualification.card_is_latest(${systemId}::uuid) AS latest`;
  return rows[0]?.latest === true;
}
