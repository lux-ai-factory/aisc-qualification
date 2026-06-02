"use client";

import { useActionState, useState } from "react";
import type { Sector, TargetSystemCategory } from "@/data";
import type { KeyQuestion } from "@/data/keyQuestions";
import { submitQualification, type SubmitState } from "./actions";

type Props = {
  keyQuestions: KeyQuestion[];
  targetSystems: TargetSystemCategory[];
  sectors: Sector[];
};

export default function QualifyForm({
  keyQuestions,
  targetSystems,
  sectors,
}: Props) {
  const [targetTags, setTargetTags] = useState<Set<string>>(new Set());
  const [sectorTagSet, setSectorTagSet] = useState<Set<string>>(new Set());

  const toggleTarget = (tag: string) =>
    setTargetTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  const toggleSector = (tag: string) =>
    setSectorTagSet((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  const [state, formAction, pending] = useActionState<SubmitState, FormData>(
    submitQualification,
    undefined,
  );

  return (
    <form action={formAction} className="qualify-form">
      {state?.error && <div className="error">{state.error}</div>}

      <section className="qf-section">
        <h2>System metadata</h2>
        <p className="qf-help">
          Tell us what AI system this qualification is for.
        </p>

        <div className="field">
          <label htmlFor="systemName">System name</label>
          <input
            id="systemName"
            name="systemName"
            placeholder="e.g. ShelfScan Vision"
            required
          />
        </div>
        <div className="qf-row">
          <div className="field">
            <label htmlFor="systemVersion">Version</label>
            <input
              id="systemVersion"
              name="systemVersion"
              placeholder="e.g. 2.4.0"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="company">Company / provider</label>
            <input
              id="company"
              name="company"
              placeholder="e.g. Acme Retail Technologies"
              required
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="description">Short description</label>
          <textarea
            id="description"
            name="description"
            rows={3}
            placeholder="One or two sentences explaining what the system does. e.g. 'Computer vision system that detects out-of-stock items on retail shelves from in-store camera footage.'"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="targetUseCase">Target use case</label>
          <textarea
            id="targetUseCase"
            name="targetUseCase"
            rows={3}
            placeholder="The specific scenario the system is built for. e.g. 'Real-time alerts to store associates when high-velocity SKUs fall below the replenishment threshold.'"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="targetUsers">Target users</label>
          <textarea
            id="targetUsers"
            name="targetUsers"
            rows={2}
            placeholder="Who interacts with the system. e.g. 'Store associates and shelf-replenishment staff in supermarkets across the EU.'"
            required
          />
        </div>

        <TargetSystemPicker
          targetSystems={targetSystems}
          selected={targetTags}
          onToggle={toggleTarget}
        />

        <SectorPicker
          sectors={sectors}
          selected={sectorTagSet}
          onToggle={toggleSector}
        />
      </section>

      <section className="qf-section">
        <h2>Questions</h2>
        <p className="qf-help">All required to submit.</p>
        {keyQuestions.map((kq, i) => {
          const fieldId = `q:${kq.group}:${kq.id}`;
          const isGroupStart =
            i === 0 || keyQuestions[i - 1].group !== kq.group;
          return (
            <div key={fieldId} className="field">
              {isGroupStart && <h3 className="qf-group">{kq.groupLabel}</h3>}
              <label htmlFor={fieldId}>{kq.text}</label>
              <textarea id={fieldId} name={fieldId} rows={2} required />
            </div>
          );
        })}
      </section>

      <div className="qf-actions">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save qualification"}
        </button>
      </div>
    </form>
  );
}

function TargetSystemPicker({
  targetSystems,
  selected,
  onToggle,
}: {
  targetSystems: TargetSystemCategory[];
  selected: Set<string>;
  onToggle: (tag: string) => void;
}) {
  const [activeCategory, setActiveCategory] = useState("");
  const cat = targetSystems.find((c) => c.id === activeCategory);

  // Build a quick lookup so we can show selected chips with their full label,
  // even after the user moves to a different category.
  const labelFor = (tag: string): string => {
    const [catId, subId] = tag.split(":");
    const category = targetSystems.find((c) => c.id === catId);
    if (!category) return tag;
    const sub = category.items.find((s) => s.id === subId);
    if (!sub) return category.name;
    return `${category.name} / ${sub.name}`;
  };

  return (
    <div className="field">
      <label htmlFor="targetSystemCategory">
        Target system — pick capabilities
      </label>
      <p className="qf-help">
        Choose a category, then click the capabilities that apply.
        {selected.size} selected.
      </p>
      <div className="qf-picker-row">
        <select
          id="targetSystemCategory"
          className="qf-picker-select"
          value={activeCategory}
          onChange={(e) => setActiveCategory(e.target.value)}
        >
          <option value="">Choose a category…</option>
          {targetSystems.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="qf-picker-options">
          {cat ? (
            cat.items.map((sub) => {
              const tag = `${cat.id}:${sub.id}`;
              const active = selected.has(tag);
              return (
                <button
                  type="button"
                  key={tag}
                  className={`qf-chip${active ? " active" : ""}`}
                  onClick={() => onToggle(tag)}
                  aria-pressed={active}
                >
                  {sub.name}
                </button>
              );
            })
          ) : (
            <span className="qf-picker-placeholder">
              Pick a category to see its capabilities.
            </span>
          )}
        </div>
      </div>
      {selected.size > 0 && (
        <div className="qf-picker-selected">
          {Array.from(selected).map((tag) => (
            <button
              type="button"
              key={tag}
              className="qf-selected-chip"
              onClick={() => onToggle(tag)}
              aria-label={`Remove ${labelFor(tag)}`}
            >
              {labelFor(tag)} <span className="qf-selected-x">×</span>
            </button>
          ))}
        </div>
      )}
      {Array.from(selected).map((t) => (
        <input key={t} type="hidden" name="targetSystemTags" value={t} />
      ))}
    </div>
  );
}

function SectorPicker({
  sectors,
  selected,
  onToggle,
}: {
  sectors: Sector[];
  selected: Set<string>;
  onToggle: (tag: string) => void;
}) {
  const [pending, setPending] = useState("");
  const labelFor = (id: string) => sectors.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="field">
      <label htmlFor="sectorPicker">Sectors — pick application domains</label>
      <p className="qf-help">
        Add a sector from the list. {selected.size} selected.
      </p>
      <div className="qf-picker-row">
        <select
          id="sectorPicker"
          className="qf-picker-select"
          value={pending}
          onChange={(e) => {
            const v = e.target.value;
            if (v && !selected.has(v)) onToggle(v);
            setPending("");
          }}
        >
          <option value="">Add a sector…</option>
          {sectors
            .filter((s) => !selected.has(s.id))
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
        <span className="qf-picker-placeholder">
          Selecting a sector adds it to the chips below.
        </span>
      </div>
      {selected.size > 0 && (
        <div className="qf-picker-selected">
          {Array.from(selected).map((id) => (
            <button
              type="button"
              key={id}
              className="qf-selected-chip qf-selected-chip--sector"
              onClick={() => onToggle(id)}
              aria-label={`Remove ${labelFor(id)}`}
            >
              {labelFor(id)} <span className="qf-selected-x">×</span>
            </button>
          ))}
        </div>
      )}
      {Array.from(selected).map((t) => (
        <input key={t} type="hidden" name="sectorTags" value={t} />
      ))}
    </div>
  );
}
