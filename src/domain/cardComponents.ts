/**
 * The engine components an AI card links, through AIRO.
 *
 * The card's components are the engine's real ones (its AIComponent rows),
 * linked by an AIRO property of the system: hasModel for a model or an LLM,
 * hasTrainingData / hasTestingData / hasValidationData for a dataset, and
 * hasComponent for anything else. Each link keeps a snapshot of the engine
 * component (its type and object name), so drift from the engine can be shown
 * rather than fixed silently.
 */

export type AiroProperty =
  | "hasModel"
  | "hasTrainingData"
  | "hasTestingData"
  | "hasValidationData"
  | "hasComponent";

/** An engine component, as GET /api/v1/projects/{pid}/aisystem lists it. */
export type EngineComponent = {
  pid: string;
  name: string;
  description?: string;
  component_type: string;
  data: string;
  file_size?: number | null;
  json_value?: unknown;
  source_dataset_pid?: string | null;
};

/** A card_component row: the link and its snapshot. */
export type LinkedComponent = {
  componentPid: string;
  airoProperty: string;
  name: string;
  componentType: string;
  objectName: string;
  /** Which of the card's components it is; null or absent for none. */
  componentKey?: string | null;
};

/** The property a component of this type is linked by, unless someone picks another. */
export function defaultProperty(componentType: string): AiroProperty {
  if (componentType === "model" || componentType === "llm") return "hasModel";
  if (componentType === "dataset") return "hasTestingData";
  return "hasComponent";
}

/** The properties a component of this type may be linked by. */
export function propertyOptions(componentType: string): AiroProperty[] {
  if (componentType === "dataset")
    return ["hasTestingData", "hasTrainingData", "hasValidationData"];
  if (componentType === "model" || componentType === "llm") return ["hasModel"];
  return ["hasComponent"];
}

export type ComponentDrift = {
  /** Linked, but the engine no longer has it. */
  removed: LinkedComponent[];
  /** In the engine, not linked. */
  added: EngineComponent[];
  /** Linked, but the engine's type or object differs from the snapshot (a re-upload). */
  changed: EngineComponent[];
};

/** Where the card's links and the engine disagree. Pure: changes nothing it is given. */
export function componentDrift(
  linked: LinkedComponent[],
  engine: EngineComponent[],
): ComponentDrift {
  const enginePids = new Set(engine.map((c) => c.pid));
  const linkOf = new Map(linked.map((l) => [l.componentPid, l]));
  return {
    removed: linked.filter((l) => !enginePids.has(l.componentPid)),
    added: engine.filter((c) => !linkOf.has(c.pid)),
    changed: engine.filter((c) => {
      const link = linkOf.get(c.pid);
      return (
        link !== undefined &&
        (link.componentType !== c.component_type || link.objectName !== c.data)
      );
    }),
  };
}

export function hasDrift(drift: ComponentDrift): boolean {
  return drift.removed.length + drift.added.length + drift.changed.length > 0;
}

/**
 * Which of the card's components a linked engine item is: none, or one of the
 * same card's component keys. Test material (hasTestingData) is what an assessment uses, never a
 * part of the system.
 */
export function partOfLink(
  airoProperty: string,
  componentKey: string | null,
  cardKeys: ReadonlySet<string>,
): { ok: true; componentKey: string | null } | { ok: false; error: string } {
  if (!componentKey) return { ok: true, componentKey: null };
  if (airoProperty === "hasTestingData") {
    return {
      ok: false,
      error:
        "Test material is what an assessment uses, not a part of the system.",
    };
  }
  if (!cardKeys.has(componentKey))
    return { ok: false, error: "That component is not on this card." };
  return { ok: true, componentKey };
}
