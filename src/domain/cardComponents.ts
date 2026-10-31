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

/** The AIRO property an engine component is linked by. The engine says what a component is,
 *  not what a dataset is used for (training, testing, validation), so a dataset is linked as a
 *  part of the system, never as one of those. */
function airoPropertyOf(componentType: string): string {
  return componentType === "model" || componentType === "llm" ? "hasModel" : "hasComponent";
}

/** The links a save writes: one per engine component, with the snapshot drift is measured
 *  against, in the order a card reads them back (by pid, all linked at once). Pure. */
export function engineLinks(engine: EngineComponent[]): LinkedComponent[] {
  return engine
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
