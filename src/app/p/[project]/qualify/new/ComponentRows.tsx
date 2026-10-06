"use client";

import { useState } from "react";
import {
  COMPONENT_BLOCK,
  COMPONENT_NAME_MAX,
  COMPONENT_PROVIDERS,
  COMPONENT_TYPES,
} from "@/data/componentFields";
import type { ComponentExample } from "@/data/examples";
import Carousel from "./Carousel";

// The Components block: one row per part of the system. Field names are
// `component:<row>:<field>`; <row> is the row's place on the page, not its identity. The identity
// is `component:<row>:key`, the key the card before gave it (empty for a new row or a
// suggestion): the server keeps it, gives a new row a fresh one, and refuses a key it did not
// give. Unlike risks a card may have no components at all, so the block may be empty. One
// component per page of a carousel; a new one opens on its own page.
type Row = { id: number; provider: string; values: ComponentExample };

const blank = (): ComponentExample => ({
  key: "",
  name: "",
  role: "",
  type: "",
  provider: "in_house",
  providerName: "",
});

// One Type list: VAIR's AIComponent terms, then ours only for what VAIR has no term for.
const VAIR_TYPES = COMPONENT_TYPES.filter((t) => t.vair);
const OWN_TYPES = COMPONENT_TYPES.filter((t) => !t.vair);

export default function ComponentRows({
  initial,
}: {
  initial?: ComponentExample[];
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    (initial ?? []).map((values, i) => ({
      id: i,
      provider: values.provider,
      values,
    })),
  );
  const [nextId, setNextId] = useState((initial ?? []).length);
  const [page, setPage] = useState(0);

  const addRow = () => {
    setPage(rows.length);
    setRows((r) => [
      ...r,
      { id: nextId, provider: "in_house", values: blank() },
    ]);
    setNextId((n) => n + 1);
  };
  const removeRow = (id: number) =>
    setRows((r) => r.filter((x) => x.id !== id));
  const setProvider = (id: number, provider: string) =>
    setRows((r) =>
      r.map((row) => (row.id === id ? { ...row, provider } : row)),
    );

  return (
    <section className="qf-section">
      <h2>
        {COMPONENT_BLOCK.title}{" "}
        <span className="qf-citation">{COMPONENT_BLOCK.citation}</span>
      </h2>
      <p className="qf-help">{COMPONENT_BLOCK.help}</p>

      <Carousel
        label="Component"
        page={page}
        onPage={setPage}
        pages={rows.map((row, n) => {
          const field = (f: string) => `component:${n}:${f}`;
          return {
            key: row.id,
            node: (
              <fieldset key={row.id} className="qf-risk qf-component">
                <legend>
                  Component {n + 1}
                  {row.values.suggested && (
                    <span className="qf-suggested">
                      {" "}
                      (suggested from your answer to 2(c): check it)
                    </span>
                  )}
                  <button
                    type="button"
                    className="qf-risk-remove"
                    onClick={() => removeRow(row.id)}
                  >
                    Remove
                  </button>
                </legend>
                <input
                  type="hidden"
                  name={field("key")}
                  value={row.values.key}
                />
                <div className="field">
                  <label className="qf-question" htmlFor={field("name")}>
                    <span className="qf-question-text">Name</span>
                  </label>
                  <input
                    id={field("name")}
                    name={field("name")}
                    defaultValue={row.values.name}
                    maxLength={COMPONENT_NAME_MAX}
                    required
                    placeholder="e.g. Scoring model"
                  />
                </div>
                <div className="field">
                  <label className="qf-question" htmlFor={field("type")}>
                    <span className="qf-question-text">Type</span>
                  </label>
                  <select
                    id={field("type")}
                    name={field("type")}
                    required
                    defaultValue={row.values.type}
                  >
                    <option value="" disabled>
                      Choose…
                    </option>
                    <optgroup label="Standard types">
                      {VAIR_TYPES.map((t) => (
                        <option
                          key={t.id}
                          value={t.id}
                          title={t.definition || undefined}
                        >
                          {t.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Other types">
                      {OWN_TYPES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <div className="field">
                  <label className="qf-question" htmlFor={field("role")}>
                    <span className="qf-optional">optional</span>
                    <span className="qf-question-text">
                      What it does in the system
                    </span>
                  </label>
                  <textarea
                    id={field("role")}
                    name={field("role")}
                    rows={2}
                    defaultValue={row.values.role}
                  />
                </div>
                <div className="field">
                  <label className="qf-question" htmlFor={field("provider")}>
                    <span className="qf-question-text">Who provides it</span>
                  </label>
                  <select
                    id={field("provider")}
                    name={field("provider")}
                    value={row.provider}
                    onChange={(e) => setProvider(row.id, e.target.value)}
                  >
                    {COMPONENT_PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  {row.provider === "third_party" && (
                    <input
                      name={field("providerName")}
                      defaultValue={row.values.providerName}
                      required
                      placeholder="the third party, e.g. OpenAI"
                      aria-label="Third party"
                    />
                  )}
                </div>
              </fieldset>
            ),
          };
        })}
      />

      <button type="button" className="btn ghost qf-risk-add" onClick={addRow}>
        + Add a component
      </button>
    </section>
  );
}
