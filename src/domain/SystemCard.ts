import { isVairTerm, vairLabel } from "@/data/vairVocab";
import { cardVersionShort } from "@/domain/cardVersions";

/** Which card version and revision a card is, and whether a later revision of its version replaced it. */
export type CardPlaceFacts = {
  version: number | null;
  revision: number;
  superseded: boolean;
  amendReason?: string | null;
  amendRequestedBy?: string | null;
};

/** Slug for a filename. */
function fileSlug(systemName: string): string {
  // Trimmed at both ends: a name ending in punctuation would otherwise slug to
  // a trailing "_", which the filename then doubles.
  return systemName
    .replace(/[^a-zA-Z0-9-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

/** The facts a card always has, because the form always collects them. */
export type CardFacts = {
  id: string;
  systemName: string;
  systemVersion: string;
  company: string;
  description: string;
  targetUseCase: string;
  targetUsers: string;
  targetSystemTags: string[];
  sectorTags: string[];
};

/**
 * The payload the PDF renderer is sent: the form's own facts plus the graph.
 */
export function systemCardPayload(
  facts: CardFacts,
  ontology: unknown | null,
  now: Date = new Date(),
  place?: CardPlaceFacts,
): Record<string, unknown> {
  return {
    // which card version and revision this is, so two revisions of one version are told apart
    ...(place && {
      card_version: place.version,
      card_revision: place.revision,
      superseded: place.superseded,
      amend_reason: place.amendReason ?? null,
      amend_requested_by: place.amendRequestedBy ?? null,
    }),
    system_name: facts.systemName,
    system_version: facts.systemVersion,
    provider: facts.company,
    description: facts.description,
    target_use_case: facts.targetUseCase,
    target_users: facts.targetUsers,
    // VAIR terms: a capability is a flat term, so it has no category; the renderer
    // then shows its label alone. A value that is not a VAIR term of its class is left out.
    classification: {
      target_systems: facts.targetSystemTags
        .filter((t) => isVairTerm("AICapability", t))
        .map((t) => ({ subcategory: vairLabel("AICapability", t) })),
      sectors: facts.sectorTags
        .filter((t) => isVairTerm("Domain", t))
        .map((t) => vairLabel("Domain", t)),
    },
    generated_at: now.toISOString().slice(0, 16).replace("T", " ") + " UTC",
    qualification_id: facts.id,
    ...(ontology ? { ontology } : {}),
  };
}

/**
 * The card as a file a machine can read, losing nothing.
 *
 * The PDF is a rendering of the view, and the view is a projection of the
 * graph, so neither alone is the whole card: the view adds the AI Act
 * citations, which `build_view` computes and the graph does not hold, and the
 * graph holds nodes and triples the view does not surface. This carries both,
 * on top of the same payload the renderer is sent, so a JSON export and a PDF
 * of the same qualification cannot disagree.
 */
export function aiCardExport(
  facts: CardFacts,
  build: { view: unknown; jsonld: string; problems: string[] },
  now: Date = new Date(),
  place?: CardPlaceFacts,
): Record<string, unknown> {
  let graph: unknown = null;
  try {
    graph = JSON.parse(build.jsonld);
  } catch {
    // A graph we cannot parse is still a card worth exporting; the view holds
    // everything a reader needs, and the problems list says what went wrong.
    graph = null;
  }
  return {
    ...systemCardPayload(facts, build.view, now, place),
    ontology_graph: graph,
    ontology_problems: build.problems,
  };
}

/** A version with exactly one leading "v". Providers often type the "v"
 *  themselves, and prefixing another would show "vv1.2.0". Mirrors
 *  SystemCard.version_label in the renderer. */
export function versionLabel(version: string): string {
  const v = version.trim();
  return v.toLowerCase().startsWith("v") ? v : `v${v}`;
}

/** The system's own software number as the page shows it, without a "v": "v"
 *  is kept for AI card versions, so the two numbers are never confused. */
export function releaseLabel(version: string): string {
  return `System release ${version.trim().replace(/^v/i, "")}`;
}

/** The button that opens the form again, naming the AI card version that
 *  saving makes. With no version yet, saving makes the first card. When the
 *  latest card may also be corrected (`correctable`), saving does not always make
 *  a version: the person chooses on the form, so the button promises none. */
export function updateAnswersLabel(latest: number | undefined, correctable: boolean = false): string {
  if (!latest) return "Create the AI card";
  return correctable ? "Update the answers" : `Update the answers (makes v${latest + 1})`;
}

/** The filename a download offers: slugged system name, the version once, the card
 *  version and revision when known ("v1", "v1.2"), and what the file is. `suffix` is
 *  e.g. "ontology.jsonld", "system_card.pdf".
 *  The version is slugged too, keeping its dots: a header can carry no character
 *  past Latin-1 and no quote, and "2.0 – beta" would make the download fail. */
export function cardFileName(
  facts: Pick<CardFacts, "systemName" | "systemVersion">,
  suffix: string,
  place?: Pick<CardPlaceFacts, "version" | "revision">,
): string {
  const version = versionLabel(facts.systemVersion)
    .replace(/[^a-zA-Z0-9.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const card = place?.version ? `${cardVersionShort(place.version, place.revision)}_` : "";
  return `${fileSlug(facts.systemName)}_${version}_${card}${suffix}`;
}
