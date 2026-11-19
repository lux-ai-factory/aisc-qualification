/**
 * The engine components an AI card links, through AIRO.
 *
 * The card's components are the engine's real ones (its AIComponent rows),
 * linked by an AIRO property of the system: hasModel for a model or an LLM,
 * and hasComponent for every other type, datasets included (the engine does not
 * say what a dataset is used for). Each link keeps a snapshot of the engine
 * component (its type and object name), so drift from the engine can be shown
 * rather than fixed silently.
 */

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

export type ComponentDrift = {
  /** Linked, but the engine no longer has it. */
  removed: LinkedComponent[];
  /** In the engine, not linked. */
  added: EngineComponent[];
  /** Linked, but the engine's type or object differs from the snapshot (a re-upload). */
  changed: EngineComponent[];
};

/** The platform's own mirror of a target (a system or component the card describes): not card content. */
function isPlatformMirror(c: { name?: string; data?: string; objectName?: string }): boolean {
  return (
    (c.data ?? c.objectName ?? "").startsWith("target:") || (c.name ?? "").startsWith("AI card · ")
  );
}

/** Test data and helper models are the engine's own working material, not what the card describes. */
const NOT_CARD_TYPES = new Set(["dataset", "datashape", "llm"]);

function isCardContent(c: { name?: string; data?: string; objectName?: string; type: string }): boolean {
  return !isPlatformMirror(c) && !NOT_CARD_TYPES.has(c.type);
}

/** Where the card's links and the engine disagree. Mirrors, test data and helper models are left
 *  out on both sides. A card that links no engine component claims none (cards saved before links
 *  existed, or while the engine did not answer), so nothing is added to it. Pure: changes nothing
 *  it is given. */
export function componentDrift(
  allLinked: LinkedComponent[],
  allEngine: EngineComponent[],
): ComponentDrift {
  const linked = allLinked.filter((l) => isCardContent({ ...l, type: l.componentType }));
  const engine = allEngine.filter((c) => isCardContent({ ...c, type: c.component_type }));
  const enginePids = new Set(engine.map((c) => c.pid));
  const linkOf = new Map(linked.map((l) => [l.componentPid, l]));
  return {
    removed: linked.filter((l) => !enginePids.has(l.componentPid)),
    added: linked.length === 0 ? [] : engine.filter((c) => !linkOf.has(c.pid)),
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

/** The AIRO property an engine component is linked by. The engine says what a component is,
 *  not what a dataset is used for (training, testing, validation), so a dataset is linked as a
 *  part of the system, never as one of those. */
function airoPropertyOf(componentType: string): string {
  return componentType === "model" || componentType === "llm" ? "hasModel" : "hasComponent";
}

/** The links a save writes: one per engine component that is card content, with the snapshot drift is measured
 *  against, in the order a card reads them back (by pid, all linked at once). Pure. */
export function engineLinks(engine: EngineComponent[]): LinkedComponent[] {
  return engine
    .filter((c) => isCardContent({ ...c, type: c.component_type }))
    .map((c) => ({
      componentPid: c.pid,
      airoProperty: airoPropertyOf(c.component_type),
      name: c.name,
      componentType: c.component_type,
      objectName: c.data ?? "",
      componentKey: null,
    }))
    .sort((a, b) => (a.componentPid < b.componentPid ? -1 : a.componentPid > b.componentPid ? 1 : 0));
}
