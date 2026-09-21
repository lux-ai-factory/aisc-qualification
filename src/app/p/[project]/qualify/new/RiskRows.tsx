"use client";

import { useState } from "react";
import { AFFECTED, IMPACT_AREAS } from "@/data/airoVocab";
import { RISK_BLOCK, RISK_FIELDS } from "@/data/riskFields";
import type { RiskExample } from "@/data/examples";

// Question 15: one row per risk. Field names are `risk:<key>:<field>`; the key
// is the row's stable id (not its position), so removing a middle row leaves a
// gap the parser tolerates and renumbers.
type Row = { key: number; areas: Set<string>; values?: RiskExample };

export default function RiskRows({ initial }: { initial?: RiskExample[] }) {
  // One row per risk in the example, or one empty row to start from.
  const [rows, setRows] = useState<Row[]>(() =>
    initial?.length
      ? initial.map((values, i) => ({
          key: i,
          areas: new Set(values.areas),
          values,
        }))
      : [{ key: 0, areas: new Set() }],
  );
  const [nextKey, setNextKey] = useState(initial?.length || 1);

  const addRow = () => {
    setRows((r) => [...r, { key: nextKey, areas: new Set() }]);
    setNextKey((k) => k + 1);
  };
  const removeRow = (key: number) =>
    setRows((r) => (r.length > 1 ? r.filter((x) => x.key !== key) : r));
  const toggleArea = (key: number, id: string) =>
    setRows((r) =>
      r.map((row) => {
        if (row.key !== key) return row;
        const areas = new Set(row.areas);
        if (areas.has(id)) areas.delete(id);
        else areas.add(id);
        return { ...row, areas };
      }),
    );

  return (
    <section className="qf-section">
      <h2>
        {RISK_BLOCK.title}{" "}
        <span className="qf-citation">{RISK_BLOCK.citation}</span>
      </h2>
      <p className="qf-help">{RISK_BLOCK.help}</p>

      {rows.map((row, n) => (
        <fieldset key={row.key} className="qf-risk">
          <legend>
            Risk {n + 1}
            {rows.length > 1 && (
              <button
                type="button"
                className="qf-risk-remove"
                onClick={() => removeRow(row.key)}
              >
                Remove
              </button>
            )}
          </legend>
          {RISK_FIELDS.map((f) => {
            const name = `risk:${row.key}:${f.id}`;
            return (
              <div key={f.id} className="field">
                <label className="qf-question" htmlFor={name}>
                  <span className="qf-citation">{f.citation}</span>
                  {f.optional && (
                    <span className="qf-optional">where applicable</span>
                  )}
                  <span className="qf-question-text">{f.label}</span>
                </label>
                {f.kind === "text" && (
                  <textarea
                    id={name}
                    name={name}
                    defaultValue={
                      (row.values?.[f.id as keyof RiskExample] as string) ?? ""
                    }
                    rows={2}
                    required={!f.optional}
                    placeholder={f.placeholder}
                  />
                )}
                {f.kind === "affected" && (
                  <select
                    id={name}
                    name={name}
                    required
                    defaultValue={row.values?.affected ?? ""}
                  >
                    <option value="" disabled>
                      Choose…
                    </option>
                    {AFFECTED.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                )}
                {f.kind === "areas" && (
                  <>
                    <div className="qf-picker-options" id={name}>
                      {IMPACT_AREAS.map((a) => {
                        const active = row.areas.has(a.id);
                        return (
                          <button
                            type="button"
                            key={a.id}
                            className={`qf-chip${active ? " active" : ""}`}
                            onClick={() => toggleArea(row.key, a.id)}
                            aria-pressed={active}
                          >
                            {a.label}
                          </button>
                        );
                      })}
                    </div>
                    {Array.from(row.areas).map((id) => (
                      <input key={id} type="hidden" name={name} value={id} />
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </fieldset>
      ))}

      <button type="button" className="btn ghost qf-risk-add" onClick={addRow}>
        + Add another risk
      </button>
    </section>
  );
}
