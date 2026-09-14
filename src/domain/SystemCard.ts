import { findSector, parseTargetSystemTag } from "@/data";

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
 *
 * `generated` is merged in first where a written card exists, so the form's
 * facts override it: prose can be older than the last edit to the form.
 */
export function systemCardPayload(
  facts: CardFacts,
  generated: Record<string, unknown> | null,
  ontology: unknown | null,
  now: Date = new Date(),
): Record<string, unknown> {
  const targetSystems = facts.targetSystemTags
    .map(parseTargetSystemTag)
    .filter((t): t is NonNullable<typeof t> => t !== null);

  return {
    ...(generated ?? {}),
    system_name: facts.systemName,
    system_version: facts.systemVersion,
    provider: facts.company,
    description: facts.description,
    target_use_case: facts.targetUseCase,
    target_users: facts.targetUsers,
    classification: {
      target_systems: targetSystems.map((t) => ({
        category: t.category.name,
        subcategory: t.sub.name,
      })),
      sectors: facts.sectorTags
        .map((id) => findSector(id)?.name)
        .filter((name): name is string => Boolean(name)),
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
    ...systemCardPayload(facts, null, build.view, now),
    ontology_graph: graph,
    ontology_problems: build.problems,
  };
}

/** A version with exactly one leading "v". Providers type it themselves about
 *  half the time, and every place that showed "v{version}" showed "vv1.2.0"
 *  when they did. Mirrors SystemCard.version_label in the renderer. */
export function versionLabel(version: string): string {
  const v = version.trim();
  return v.toLowerCase().startsWith("v") ? v : `v${v}`;
}

/** The filename a download offers: slugged system name, the version once, and
 *  what the file is. `suffix` is e.g. "ontology.jsonld", "system_card.pdf". */
export function cardFileName(
  facts: Pick<CardFacts, "systemName" | "systemVersion">,
  suffix: string,
): string {
  return `${fileSlug(facts.systemName)}_${versionLabel(facts.systemVersion)}_${suffix}`;
}
