/**
 * Only the current card changes: the highest revision of the latest version.
 *
 * Every save makes the next version; an older version's card is kept as it was.
 * A correction makes the next revision of the latest version's card; the
 * revision it corrects is kept as it was too.
 * The database refuses such a write too (qualification's only-latest triggers);
 * this check comes first so a refused action writes nothing and says why.
 */
import { platformClient } from "@/server/services/PlatformClient";
import type { QualificationRepository } from "@/server/repositories/QualificationRepository";

/** What the check reads of the project's cards. */
type Cards = Pick<QualificationRepository, "cardStanding">;

export const NOT_LATEST =
  "403: this AI card is of an older version and is kept as it was; only the latest version changes.";

class NotLatestError extends Error {
  constructor() {
    super(NOT_LATEST);
    this.name = "NotLatestError";
  }
}

/** Whether card `cardId` (in `cards`, the project's database) is the current
 *  one: the project's latest card version, as the platform says, and that
 *  version's highest revision. */
export async function isLatestCard(
  projectId: string,
  cardId: string,
  cards: Cards,
): Promise<boolean> {
  const standing = await cards.cardStanding(cardId);
  if (!standing?.latestRevision) return false;
  const latest = await platformClient.latestVersion(projectId);
  return latest?.pid === standing.systemId;
}

/** Throws NotLatestError unless card `cardId` is the current one (isLatestCard). */
export async function assertLatestCard(
  projectId: string,
  cardId: string,
  cards: Cards,
): Promise<void> {
  if (!(await isLatestCard(projectId, cardId, cards))) throw new NotLatestError();
}
