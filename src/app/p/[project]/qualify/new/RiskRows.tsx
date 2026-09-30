"use client";

import { useState } from "react";
import { AFFECTED } from "@/data/airoVocab";
import { IMPACT_AREAS, SUBJECTS, vairTerms } from "@/data/vairVocab";
import { RISK_BLOCK, RISK_FIELDS, type RiskField } from "@/data/riskFields";
import type { RiskExample } from "@/data/examples";

// Question 15: one row per risk. Field names are `risk:<key>:<field>`; the key
// is the row's stable id (not its position), so removing a middle row leaves a
// gap the parser tolerates and renumbers. A field VAIR can type has one VAIR
// select, `risk:<key>:<field>Term` (2026-09-30); the harm is only that select.

/** The one VAIR select of a risk field. Required where VAIR always has a term that fits; the
 *  follow-up's only when there is a follow-up, which the server checks. */
function TermSelect({ f, name, initial }: { f: RiskField; name: string; initial: string }) {
  const terms = vairTerms(f.vair!);
  return (
    <select
      id={name}
      name={name}
      className="qf-term"
      aria-label={`${f.label}: term`}
      required={!f.termOptional && !f.optional}
      defaultValue={initial}
    >
      <option value="">{f.termOptional || f.optional ? "Matching term (none fits)" : "Choose the matching term…"}</option>
      {terms.map((t) => (
        <option key={t.id} value={t.id} title={t.definition || undefined}>
          {t.label}
        </option>
      ))}
    </select>
  );
}
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
            const termName = `${name}Term`;
            const termValue = (row.values?.[`${f.id}Term` as keyof RiskExample] as string | undefined) ?? "";
            return (
              <div key={f.id} className="field">
                <label className="qf-question" htmlFor={f.kind === "term" ? termName : name}>
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
                {f.vair && <TermSelect f={f} name={termName} initial={termValue} />}
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
                    <optgroup label="Standard groups">
                      {SUBJECTS.map((t) => (
                        <option key={t.id} value={t.id} title={t.definition || undefined}>
                          {t.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Other groups">
                      {AFFECTED.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.label}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                )}
                {f.kind === "areas" && (
                  <>
                    <div className="qf-picker-options" id={name} data-field={name}>
                      {IMPACT_AREAS.map((a) => {
                        const active = row.areas.has(a.id);
                        return (
                          <button
                            type="button"
                            key={a.id}
                            className={`qf-chip${active ? " active" : ""}`}
                            onClick={() => toggleArea(row.key, a.id)}
                            aria-pressed={active}
                            title={a.definition || undefined}
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
