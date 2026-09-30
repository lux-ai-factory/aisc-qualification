/**
 * One AI card per saved version.
 *
 * A project has one AI system; its AI card is what is versioned. Every save
 * makes the next version (a row of core.system, numbered 1, 2, ... by the
 * platform) and the card that describes it. Only the latest version changes;
 * the older ones are kept as they were. The next card starts from the newest
 * card before it, loaded into the form to be reviewed, not typed again.
 */
import type { ComponentExample, FormExample, RiskExample } from "@/data/examples/types";
import { componentType } from "@/data/componentFields";

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
  sourceTerm?: string | null;
  vulnerability: string | null;
  consequence: string;
  consequenceTerm?: string | null;
  impactTerm?: string | null;
  affected: string;
  impactAreas: string[];
  control: string;
  controlTerm?: string | null;
  followUpControl: string | null;
  followUpControlTerm?: string | null;
};

type CardComponentRow = {
  position: number;
  key: string;
  name: string;
  role: string | null;
  kind: string;
  vairType?: string | null;
  provider: string;
  providerName: string | null;
};

/** The components the next card starts from: the card's rows with their keys, or, when it has
 *  none, what the filler extracted from 2(c), as suggestions without keys. */
function startingComponents(card: CardContent): ComponentExample[] {
  const rows = [...(card.systemComponents ?? [])].sort((a, b) => a.position - b.position);
  if (rows.length) {
    return rows.map((r) => ({
      key: r.key,
      name: r.name,
      role: r.role ?? "",
      type: componentType(r.kind, r.vairType),
      provider: r.provider === "third_party" ? "third_party" : "in_house",
      providerName: r.providerName ?? "",
    }));
  }
  const extracted = (card.ontologyExtracted as { components?: unknown[] } | null | undefined)?.components ?? [];
  return extracted
    .map((e) => (typeof e === "string" ? e : typeof (e as { label?: unknown })?.label === "string" ? (e as { label: string }).label : ""))
    .filter((label) => label.trim() !== "")
    .map((label) => ({ key: "", name: label.trim(), role: "", type: "", provider: "in_house" as const, providerName: "", suggested: true }));
}

export type CardContent = {
  systemName: string;
  systemVersion: string;
  company: string;
  description: string;
  targetUseCase: string;
  targetUsers: string;
  intendedDeployers: string | null;
  systemType?: string | null;
  purpose?: string | null;
  providerTerm?: string | null;
  deployerTerm?: string | null;
  targetSystemTags: string[];
  sectorTags: string[];
  marketFormTags: string[];
  localityTags: string[];
  answers: { toolId: string; questionId: string; answer: string }[];
  risks: CardRisk[];
  /** The Components block's rows (absent or empty on a card made before it). */
  systemComponents?: CardComponentRow[];
  /** The filler's extraction: its components are offered when the card has no rows yet. */
  ontologyExtracted?: unknown;
  /** The questionnaire version it was filled with; NULL (or absent) is the default version. */
  questionnaireVersionId?: string | null;
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
      sourceTerm: r.sourceTerm ?? "",
      consequenceTerm: r.consequenceTerm ?? "",
      impactTerm: r.impactTerm ?? "",
      controlTerm: r.controlTerm ?? "",
      followUpControlTerm: r.followUpControlTerm ?? "",
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
      systemType: card.systemType ?? "",
      purpose: card.purpose ?? "",
      providerTerm: card.providerTerm ?? "",
      deployerTerm: card.deployerTerm ?? "",
      targetSystemTags: card.targetSystemTags,
      sectorTags: card.sectorTags,
      marketFormTags: card.marketFormTags,
      localityTags: card.localityTags,
    },
    answers: Object.fromEntries(
      card.answers.map((a) => [`q:${a.toolId}:${a.questionId}`, a.answer]),
    ),
    risks,
    components: startingComponents(card),
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
