"use client";

import { useState, useTransition } from "react";
import {
  defaultProperty,
  propertyOptions,
  type EngineComponent,
  type LinkedComponent,
} from "@/domain/cardComponents";
import { linkComponent, unlinkComponent } from "./component-actions";

// The engine's components, linked to the latest card by an AIRO property. The
// filler's free-text components are only suggestions: nothing is linked unless
// a person links it.
export default function ComponentsPanel({
  projectId,
  qualificationId,
  engine,
  engineError,
  linked,
  suggestions,
  parts = [],
}: {
  projectId: string;
  qualificationId: string;
  engine: EngineComponent[];
  engineError: string | null;
  linked: LinkedComponent[];
  suggestions: string[];
  /** The card's own components (its Components block), which a linked item may be. */
  parts?: { key: string; name: string }[];
}) {
  const linkOf = new Map(linked.map((l) => [l.componentPid, l]));
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [partOf, setPartOf] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (!result.ok) setError(result.error ?? "Something went wrong.");
    });

  return (
    <section className="qf-section">
      <h2>Components</h2>
      {engineError ? (
        <p className="qf-help">
          The engine did not answer: its components cannot be linked now.
        </p>
      ) : engine.length === 0 ? (
        <p className="qf-help">
          The engine has no components for this project yet.
        </p>
      ) : (
        <ul className="qf-rows">
          {engine.map((c) => {
            const link = linkOf.get(c.pid);
            const property =
              chosen[c.pid] ??
              link?.airoProperty ??
              defaultProperty(c.component_type);
            return (
              <li key={c.pid}>
                <strong>{c.name}</strong> ({c.component_type}){" "}
                <select
                  value={property}
                  disabled={pending}
                  onChange={(e) =>
                    setChosen({ ...chosen, [c.pid]: e.target.value })
                  }
                  aria-label={`AIRO property of ${c.name}`}
                >
                  {propertyOptions(c.component_type).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>{" "}
                {parts.length > 0 && property !== "hasTestingData" && (
                  <select
                    value={partOf[c.pid] ?? link?.componentKey ?? ""}
                    disabled={pending}
                    onChange={(e) =>
                      setPartOf({ ...partOf, [c.pid]: e.target.value })
                    }
                    aria-label={`Which component ${c.name} is`}
                  >
                    <option value="">not a component</option>
                    {parts.map((p) => (
                      <option key={p.key} value={p.key}>
                        is: {p.name}
                      </option>
                    ))}
                  </select>
                )}{" "}
                <button
                  type="button"
                  className="btn ghost"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      linkComponent(
                        projectId,
                        qualificationId,
                        c.pid,
                        property,
                        property === "hasTestingData"
                          ? null
                          : (partOf[c.pid] ?? link?.componentKey ?? null) ||
                              null,
                      ),
                    )
                  }
                >
                  Link
                </button>
                {link && (
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        unlinkComponent(projectId, qualificationId, c.pid),
                      )
                    }
                  >
                    Unlink
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {suggestions.length > 0 && (
        <p className="qf-help">
          Suggestions from the card agent (not linked): {suggestions.join(", ")}
        </p>
      )}
      {error && <div className="error">{error}</div>}
    </section>
  );
}
