/**
 * One AI card per version of a project's AI system.
 *
 * The versions are the platform's: the latest is a draft until something
 * depends on it, then frozen, and the next edit makes the version after it.
 * Submitting a card is one of the things that freezes a version, so the next
 * card is always about a version with no card yet: the draft, or the version
 * after a frozen latest. It starts from the newest card before it, loaded into
 * the form to be reviewed, not typed again.
 */
import type { FormExample, RiskExample } from "@/data/examples/types";

export type VersionRef = { pid: string; number: number; frozen_at: string | null };
export type CardRef = { id: string; systemId: string };

export type NextCard = {
  /** The version the next card will describe. */
  versionNumber: number;
  /** The card it starts from, and that card's version; null for the first. */
  fromCardId: string | null;
  fromVersionNumber: number | null;
};

/** `versions` in any order; `cards` are the project's cards. */
export function nextCard(versions: VersionRef[], cards: CardRef[]): NextCard {
  const byNumber = [...versions].sort((a, b) => b.number - a.number);
  const latest = byNumber[0];
  const cardOf = new Map(cards.map((c) => [c.systemId, c.id]));
  const versionNumber =
    latest && latest.frozen_at === null && !cardOf.has(latest.pid)
      ? latest.number
      : (latest?.number ?? 0) + 1;
  const from = byNumber.find((version) => cardOf.has(version.pid));
  return {
    versionNumber,
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
  /** Whether it is the system's current card: the newest version that has one. */
  current: boolean;
  currentCardId: string | null;
};

/** Where one card stands: the system's page is its newest card, the rest are
 *  history. `systemId` is the version the card describes. */
export function cardStanding(
  versions: VersionRef[],
  cards: CardRef[],
  systemId: string,
): CardStanding {
  const cardOf = new Map(cards.map((c) => [c.systemId, c.id]));
  const newest = [...versions]
    .sort((a, b) => b.number - a.number)
    .find((version) => cardOf.has(version.pid));
  const currentCardId = newest ? (cardOf.get(newest.pid) ?? null) : null;
  return {
    versionNumber: versions.find((version) => version.pid === systemId)?.number ?? 0,
    current: currentCardId !== null && cardOf.get(systemId) === currentCardId,
    currentCardId,
  };
}
