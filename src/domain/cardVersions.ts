/**
 * One AI card per saved version.
 *
 * A project has one AI system; its AI card is what is versioned. Every save
 * makes the next version (a row of core.system, numbered 1, 2, ... by the
 * platform) and the card that describes it. Only the latest version changes;
 * the older ones are kept as they were. The next card starts from the newest
 * card before it, loaded into the form to be reviewed, not typed again.
 */
import type { FormExample, RiskExample } from "@/data/examples/types";

export type VersionRef = { pid: string; number: number };
export type CardRef = { id: string; systemId: string };

function newestFirst(versions: VersionRef[]): VersionRef[] {
  return [...versions].sort((a, b) => b.number - a.number);
}

/** Each card's id, by the version it describes. */
function cardIdByVersion(cards: CardRef[]): Map<string, string> {
  return new Map(cards.map((c) => [c.systemId, c.id]));
}

export type NextCard = {
  /** The version the next save will make. */
  versionNumber: number;
  /** The card it starts from, and that card's version; null for the first. */
  fromCardId: string | null;
  fromVersionNumber: number | null;
};

/** `versions` in any order; `cards` are the project's cards. A save always
 *  makes the version after the latest, even when the latest has no card (a
 *  save that failed after naming it: versions are never deleted). */
export function nextCard(versions: VersionRef[], cards: CardRef[]): NextCard {
  const byNumber = newestFirst(versions);
  const cardOf = cardIdByVersion(cards);
  const from = byNumber.find((version) => cardOf.has(version.pid));
  return {
    versionNumber: (byNumber[0]?.number ?? 0) + 1,
    fromCardId: from ? (cardOf.get(from.pid) ?? null) : null,
    fromVersionNumber: from ? from.number : null,
  };
}

type CardRisk = {
  position: number;
  risk: string;
  source: string;
  vulnerability: string | null;
  consequence: string;
  affected: string;
  impactAreas: string[];
  control: string;
  followUpControl: string | null;
};

export type CardContent = {
  systemName: string;
  systemVersion: string;
  company: string;
  description: string;
  targetUseCase: string;
  targetUsers: string;
  intendedDeployers: string | null;
  targetSystemTags: string[];
  sectorTags: string[];
  marketFormTags: string[];
  localityTags: string[];
  answers: { toolId: string; questionId: string; answer: string }[];
  risks: CardRisk[];
};

/** A card, as the form's starting point: every field where it came from. */
export function cardAsFormStart(card: CardContent): FormExample {
  const risks: RiskExample[] = [...card.risks]
    .sort((a, b) => a.position - b.position)
    .map((r) => ({
      risk: r.risk,
      source: r.source,
      vulnerability: r.vulnerability ?? "",
      consequence: r.consequence,
      affected: r.affected,
      areas: r.impactAreas,
      control: r.control,
      followUpControl: r.followUpControl ?? "",
    }));
  return {
    metadata: {
      systemName: card.systemName,
      systemVersion: card.systemVersion,
      company: card.company,
      description: card.description,
      targetUseCase: card.targetUseCase,
      targetUsers: card.targetUsers,
      intendedDeployers: card.intendedDeployers ?? "",
      targetSystemTags: card.targetSystemTags,
      sectorTags: card.sectorTags,
      marketFormTags: card.marketFormTags,
      localityTags: card.localityTags,
    },
    answers: Object.fromEntries(
      card.answers.map((a) => [`q:${a.toolId}:${a.questionId}`, a.answer]),
    ),
    risks,
  };
}

export type CardStanding = {
  /** The version the card describes. */
  versionNumber: number;
  /** Whether the card is of the latest version: only that one may change. */
  current: boolean;
  /** The latest version's card, or null when the latest has none. */
  currentCardId: string | null;
};

/** Where one card stands: the latest version's card is the system's page and
 *  may change; every other card is kept as it was. `systemId` is the version
 *  the card describes. */
export function cardStanding(
  versions: VersionRef[],
  cards: CardRef[],
  systemId: string,
): CardStanding {
  const cardOf = cardIdByVersion(cards);
  const latest = newestFirst(versions)[0];
  return {
    versionNumber: versions.find((version) => version.pid === systemId)?.number ?? 0,
    current: latest !== undefined && latest.pid === systemId,
    currentCardId: latest ? (cardOf.get(latest.pid) ?? null) : null,
  };
}
