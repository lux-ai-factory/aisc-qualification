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
  "This AI card is of an older version and is kept as it was; only the latest version changes.";

/** An earlier revision of the latest version: a page left open across a correction. */
export const CORRECTED_SINCE =
  "This AI card was corrected since this page was opened, and this revision is kept as it was: open the latest card to change it.";

/** The card is not the current one; the message says why, fit to show. */
export class CardNotCurrent extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CardNotCurrent";
  }
}

/** Why card `cardId` (in `cards`, the project's database) is not the current one, or null
 *  when it is: the current card is the project's latest card version, as the platform says,
 *  and that version's highest revision. */
async function whyNotCurrent(
  projectId: string,
  cardId: string,
  cards: Cards,
): Promise<string | null> {
  const standing = await cards.cardStanding(cardId);
  if (!standing) return NOT_LATEST;
  const latest = await platformClient.latestVersion(projectId);
  if (latest?.pid !== standing.systemId) return NOT_LATEST;
  return standing.latestRevision ? null : CORRECTED_SINCE;
}

/** Whether card `cardId` is the current one (see whyNotCurrent). */
export async function isLatestCard(
  projectId: string,
  cardId: string,
  cards: Cards,
): Promise<boolean> {
  return (await whyNotCurrent(projectId, cardId, cards)) === null;
}

/** Throws CardNotCurrent, saying why, unless card `cardId` is the current one. */
export async function assertLatestCard(
  projectId: string,
  cardId: string,
  cards: Cards,
): Promise<void> {
  const why = await whyNotCurrent(projectId, cardId, cards);
  if (why !== null) throw new CardNotCurrent(why);
}
