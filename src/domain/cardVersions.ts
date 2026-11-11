/**
 * One AI card per saved version.
 *
 * A project has one AI system; its AI card is what is versioned. Every save
 * makes the next version (a row of project.system in the project's database,
 * numbered 1, 2, ... by the platform) and the card that describes it. Only the latest version changes;
 * the older ones are kept as they were. The next card starts from the newest
 * card before it, loaded into the form to be reviewed, not typed again.
 */
import type {
  ComponentExample,
  FormExample,
  RiskExample,
} from "@/data/examples/types";
import { componentType } from "@/data/componentFields";

export type VersionRef = { pid: string; number: number };
export type CardRef = { id: string; systemId: string; revision: number };

function newestFirst(versions: VersionRef[]): VersionRef[] {
  return [...versions].sort((a, b) => b.number - a.number);
}

/** Each version's card: the id of its highest revision. A version's card is
 *  its latest revision; the earlier ones are kept as they were. */
function cardIdByVersion(cards: CardRef[]): Map<string, string> {
  const latest = new Map<string, CardRef>();
  for (const c of cards) {
    const seen = latest.get(c.systemId);
    if (!seen || c.revision > seen.revision) latest.set(c.systemId, c);
  }
  return new Map([...latest].map(([systemId, c]) => [systemId, c.id]));
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

/** "Version 1", or "Version 1, revision 2" once the description has been corrected. */
export function versionLabel(version: number, revision: number = 1): string {
  return revision > 1 ? `Version ${version}, revision ${revision}` : `Version ${version}`;
}

/** The kicker over a card: "AI card v1", or "Version 1, revision 2" once corrected. */
export function cardHeading(version: number, revision: number = 1): string {
  return revision > 1 ? versionLabel(version, revision) : `AI card v${version}`;
}

/** The notice on a card that is not the current one. It names the revision, because an
 *  earlier revision of the latest version is as read-only as an older version's card. */
export function keptNotice(version: number, revision: number = 1): string {
  return `Version ${version || "?"}, revision ${revision}, kept as it was: only the latest card changes.`;
}

/** Why a revision was made and at whose request; a value that was not stored is left out. */
export function amendmentText(
  reason: string | null | undefined,
  requestedBy: string | null | undefined,
): string {
  const why = reason?.trim();
  const who = requestedBy?.trim();
  return `Corrected${why ? `: ${why}` : ""}.${who ? ` Requested by ${who}.` : ""}`;
}

/** What the edit page offers besides a new version: correcting the description of the card it
 *  starts from. */
export type CorrectionOffer = {
  /** The card the page was opened on, posted back so a newer save is noticed. */
  amendsId: string;
  /** The version whose description is corrected. */
  versionNumber: number;
  /** The revision a correction makes. */
  nextRevision: number;
};

/** A correction is offered only when the card being edited is the latest version's own card
 *  (its latest revision): an older version's card is not corrected, and a latest version
 *  without a card has nothing to correct. A start from before revisions existed is revision 1. */
export function correctionOffer(
  next: NextCard,
  fromRevision: number = 1,
): CorrectionOffer | null {
  if (!next.fromCardId || next.fromVersionNumber === null) return null;
  if (next.fromVersionNumber !== next.versionNumber - 1) return null;
  return {
    amendsId: next.fromCardId,
    versionNumber: next.fromVersionNumber,
    nextRevision: fromRevision + 1,
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
  const rows = [...(card.systemComponents ?? [])].sort(
    (a, b) => a.position - b.position,
  );
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
  const extracted =
    (card.ontologyExtracted as { components?: unknown[] } | null | undefined)
      ?.components ?? [];
  return extracted
    .map((e) =>
      typeof e === "string"
        ? e
        : typeof (e as { label?: unknown })?.label === "string"
          ? (e as { label: string }).label
          : "",
    )
    .filter((label) => label.trim() !== "")
    .map((label) => ({
      key: "",
      name: label.trim(),
      role: "",
      type: "",
      provider: "in_house" as const,
      providerName: "",
      suggested: true,
    }));
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
  /** The Components block's rows (absent or empty when the card has none). */
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
      sourceTerm: r.sourceTerm ?? "",
      consequenceTerm: r.consequenceTerm ?? "",
      impactTerm: r.impactTerm ?? "",
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

/** Where one card stands: the latest version's latest revision is the system's page and
 *  may change; every other card, including an earlier revision of the latest version, is
 *  kept as it was. `systemId` is the version the card describes, `cardId` the card itself
 *  (null when only the current card is asked for). */
export function cardStanding(
  versions: VersionRef[],
  cards: CardRef[],
  systemId: string,
  cardId: string | null,
): CardStanding {
  const cardOf = cardIdByVersion(cards);
  const latest = newestFirst(versions)[0];
  const currentCardId = latest ? (cardOf.get(latest.pid) ?? null) : null;
  return {
    versionNumber:
      versions.find((version) => version.pid === systemId)?.number ?? 0,
    current: cardId !== null && currentCardId === cardId,
    currentCardId,
  };
}
